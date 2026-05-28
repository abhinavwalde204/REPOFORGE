const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const db = require('../db');
const auth = require('../middleware/auth');
const githubService = require('../services/githubService');
const embeddingService = require('../services/embeddingService');
const aiService = require('../services/groqService');

/**
 * Ensures that the target repository is cloned locally inside temp/ directory.
 * If the workspace was cleaned up, it re-clones on-the-fly to enable live editing.
 */
async function ensureRepoCloned(analysisId, githubUrl) {
  const tempCloneDir = path.resolve(__dirname, `../../temp/${analysisId}`);
  try {
    await fs.access(tempCloneDir);
  } catch (e) {
    console.log(`[Editor] Repository directory missing. Re-cloning on-the-fly to ${tempCloneDir}...`);
    await githubService.cloneRepository(githubUrl, tempCloneDir);
  }
  return tempCloneDir;
}

/**
 * @route   POST /api/editor/suggest
 * @desc    Generate code patch suggestion using RAG and MiniMax M2
 * @access  Private
 */
router.post('/suggest', auth, async (req, res) => {
  try {
    const { analysisId, filePath, prompt } = req.body;
    const userId = req.user.userId;

    if (!analysisId || !filePath || !prompt) {
      return res.status(400).json({ error: 'Missing required parameters: analysisId, filePath, prompt.' });
    }

    // 1. Fetch analysis to get github_url
    const analysisQuery = await db.query(
      `SELECT github_url FROM analyses WHERE id = $1 AND user_id = $2`,
      [analysisId, userId]
    );

    if (analysisQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Codebase analysis not found.' });
    }

    const { github_url: githubUrl } = analysisQuery.rows[0];

    // 2. Ensure repository is cloned locally
    const tempCloneDir = await ensureRepoCloned(analysisId, githubUrl);
    const targetFile = path.resolve(tempCloneDir, filePath);

    // 3. Read current file content
    let currentContent = '';
    try {
      currentContent = await fs.readFile(targetFile, 'utf-8');
    } catch (e) {
      return res.status(404).json({ error: `File ${filePath} not found in the codebase.` });
    }

    // 4. Index codebase chunks if we haven't already (lazy indexing)
    const embeddingCheck = await db.query(
      `SELECT id FROM file_embeddings WHERE analysis_id = $1 LIMIT 1`,
      [analysisId]
    );

    if (embeddingCheck.rows.length === 0) {
      console.log(`[Editor] Embedding chunks missing. Running lazy codebase indexing first...`);
      // Retrieve the nodes from analyses results (or parsed directory)
      const graphQuery = await db.query(
        `SELECT nodes FROM analyses WHERE id = $1`,
        [analysisId]
      );
      const nodes = graphQuery.rows[0]?.nodes || [];
      await embeddingService.indexCodebase(analysisId, tempCloneDir, nodes);
    }

    // 5. Query relevant RAG context chunks
    const contextChunks = await embeddingService.searchCodebase(analysisId, prompt, 3);

    // 6. Generate patch using Groq
    console.log(`[Editor] Triggering AI patch recommendation for ${filePath}...`);
    const diffText = await aiService.generateCodePatch(
      prompt,
      filePath,
      currentContent,
      contextChunks
    );

    // 7. Store editor session record
    const sessionInsert = await db.query(
      `INSERT INTO editor_sessions (analysis_id, user_id, requirement_text, affected_files, diffs_json)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        analysisId,
        userId,
        prompt,
        JSON.stringify([filePath]),
        JSON.stringify({ diff: diffText })
      ]
    );

    res.json({
      sessionId: sessionInsert.rows[0].id,
      diff: diffText,
      originalContent: currentContent,
      relevantChunks: contextChunks
    });

  } catch (err) {
    console.error('Suggest Patch Error:', err);
    res.status(500).json({ error: 'Server error generating patch suggestion.' });
  }
});

/**
 * @route   POST /api/editor/apply
 * @desc    Apply and persist a code patch version
 * @access  Private
 */
router.post('/apply', auth, async (req, res) => {
  try {
    const { analysisId, filePath, patchedContent, originalContent, notes, sessionId } = req.body;
    const userId = req.user.userId;

    if (!analysisId || !filePath || patchedContent === undefined || originalContent === undefined) {
      return res.status(400).json({ error: 'Missing required parameters to apply patch.' });
    }

    // 1. Fetch analysis
    const analysisQuery = await db.query(
      `SELECT github_url FROM analyses WHERE id = $1 AND user_id = $2`,
      [analysisId, userId]
    );

    if (analysisQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Codebase analysis not found.' });
    }

    const { github_url: githubUrl } = analysisQuery.rows[0];

    // 2. Fetch current version count
    const versionQuery = await db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version 
       FROM user_patches 
       WHERE user_id = $1 AND analysis_id = $2 AND file_path = $3`,
      [userId, analysisId, filePath]
    );
    const newVersion = versionQuery.rows[0].max_version + 1;

    // 3. Mark any previous patches for this file as inactive
    await db.query(
      `UPDATE user_patches 
       SET is_active = FALSE 
       WHERE user_id = $1 AND analysis_id = $2 AND file_path = $3`,
      [userId, analysisId, filePath]
    );

    // 4. Save new active patch record
    const insertQuery = await db.query(
      `INSERT INTO user_patches (user_id, analysis_id, file_path, original_content, patched_content, patch_source, editor_session_id, version, is_active, notes)
       VALUES ($1, $2, $3, $4, $5, 'ai', $6, $7, TRUE, $8)
       RETURNING id, version`,
      [userId, analysisId, filePath, originalContent, patchedContent, sessionId || null, newVersion, notes || '']
    );

    // 5. Update local filesystem clone to keep patches additive
    const tempCloneDir = await ensureRepoCloned(analysisId, githubUrl);
    const targetFile = path.resolve(tempCloneDir, filePath);
    await fs.writeFile(targetFile, patchedContent, 'utf-8');

    res.status(201).json({
      message: 'Patch successfully applied and saved.',
      patchId: insertQuery.rows[0].id,
      version: insertQuery.rows[0].version
    });

  } catch (err) {
    console.error('Apply Patch Error:', err);
    res.status(500).json({ error: 'Server error applying patch.' });
  }
});

/**
 * @route   GET /api/editor/patches/:analysisId
 * @desc    Fetch all patches created for a specific repository analysis
 * @access  Private
 */
router.get('/patches/:analysisId', auth, async (req, res) => {
  try {
    const { analysisId } = req.params;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT id, file_path, version, is_active, notes, created_at 
       FROM user_patches 
       WHERE user_id = $1 AND analysis_id = $2
       ORDER BY created_at DESC`,
      [userId, analysisId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Patches Error:', err);
    res.status(500).json({ error: 'Server error fetching patches.' });
  }
});

/**
 * @route   POST /api/editor/revert
 * @desc    Revert a specific patch, restoring original content to disk
 * @access  Private
 */
router.post('/revert', auth, async (req, res) => {
  try {
    const { patchId } = req.body;
    const userId = req.user.userId;

    if (!patchId) {
      return res.status(400).json({ error: 'Missing patchId parameter.' });
    }

    // 1. Fetch patch details
    const patchQuery = await db.query(
      `SELECT analysis_id, file_path, original_content 
       FROM user_patches 
       WHERE id = $1 AND user_id = $2`,
      [patchId, userId]
    );

    if (patchQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Patch record not found.' });
    }

    const { analysis_id: analysisId, file_path: filePath, original_content: originalContent } = patchQuery.rows[0];

    // 2. Fetch analysis to get github_url
    const analysisQuery = await db.query(
      `SELECT github_url FROM analyses WHERE id = $1 AND user_id = $2`,
      [analysisId, userId]
    );

    const { github_url: githubUrl } = analysisQuery.rows[0];

    // 3. Mark the patch as inactive
    await db.query(
      `UPDATE user_patches 
       SET is_active = FALSE 
       WHERE id = $1 AND user_id = $2`,
      [patchId, userId]
    );

    // 4. Restore original content back to disk
    const tempCloneDir = await ensureRepoCloned(analysisId, githubUrl);
    const targetFile = path.resolve(tempCloneDir, filePath);
    await fs.writeFile(targetFile, originalContent, 'utf-8');

    res.json({ message: `Successfully reverted patch. Restored original content of ${filePath}.` });

  } catch (err) {
    console.error('Revert Patch Error:', err);
    res.status(500).json({ error: 'Server error reverting patch.' });
  }
});

module.exports = router;
