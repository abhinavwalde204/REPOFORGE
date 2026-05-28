const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');
const db = require('../db');
const auth = require('../middleware/auth');
const githubService = require('../services/githubService');

/**
 * Ensures that the target repository is cloned locally.
 */
async function ensureRepoCloned(analysisId, githubUrl) {
  const tempCloneDir = path.resolve(__dirname, `../../temp/${analysisId}`);
  try {
    await fs.access(tempCloneDir);
  } catch (e) {
    console.log(`[Patches] Repository directory missing. Re-cloning on-the-fly to ${tempCloneDir}...`);
    await githubService.cloneRepository(githubUrl, tempCloneDir);
  }
  return tempCloneDir;
}

/**
 * @route   POST /api/patches
 * @desc    Save or update a file patch (manual edit or AI suggestion)
 * @access  Private
 */
router.post('/', auth, async (req, res) => {
  try {
    const { analysisId, filePath, patchedContent, patchSource, editorSessionId, notes } = req.body;
    const userId = req.user.userId;

    if (!analysisId || !filePath || patchedContent === undefined) {
      return res.status(400).json({ error: 'Missing required parameters: analysisId, filePath, patchedContent.' });
    }

    const source = patchSource || 'manual_edit';

    // 1. Fetch analysis details and verify ownership
    const analysisQuery = await db.query(
      `SELECT github_url FROM analyses WHERE id = $1 AND user_id = $2`,
      [analysisId, userId]
    );

    if (analysisQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found or unauthorized.' });
    }

    const { github_url: githubUrl } = analysisQuery.rows[0];

    // 2. Resolve local clone path and read original content
    const tempCloneDir = await ensureRepoCloned(analysisId, githubUrl);
    const targetFile = path.resolve(tempCloneDir, filePath);
    
    let originalContent = '';
    try {
      originalContent = await fs.readFile(targetFile, 'utf-8');
    } catch (e) {
      // If missing on disk, fall back to check if we can read from existing active patch or node list
      const fallbackQuery = await db.query(
        `SELECT original_content FROM user_patches 
         WHERE user_id = $1 AND analysis_id = $2 AND file_path = $3 
         LIMIT 1`,
        [userId, analysisId, filePath]
      );
      if (fallbackQuery.rows.length > 0) {
        originalContent = fallbackQuery.rows[0].original_content;
      } else {
        return res.status(404).json({ error: `Original file ${filePath} not found on disk.` });
      }
    }

    // 3. Deactivate any prior active patch versions for this file
    await db.query(
      `UPDATE user_patches 
       SET is_active = FALSE 
       WHERE user_id = $1 AND analysis_id = $2 AND file_path = $3`,
      [userId, analysisId, filePath]
    );

    // 4. Calculate next version index
    const versionQuery = await db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version 
       FROM user_patches 
       WHERE user_id = $1 AND analysis_id = $2 AND file_path = $3`,
      [userId, analysisId, filePath]
    );
    const newVersion = versionQuery.rows[0].max_version + 1;

    // 5. Insert new active patch record
    const insertQuery = await db.query(
      `INSERT INTO user_patches (user_id, analysis_id, file_path, original_content, patched_content, patch_source, editor_session_id, version, is_active, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
       RETURNING id, version`,
      [
        userId,
        analysisId,
        filePath,
        originalContent,
        patchedContent,
        source,
        editorSessionId || null,
        newVersion,
        notes || ''
      ]
    );

    // 6. Write patched content to the filesystem to keep changes additive
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, patchedContent, 'utf-8');

    res.status(201).json({
      message: 'Patch successfully saved and applied.',
      patchId: insertQuery.rows[0].id,
      version: insertQuery.rows[0].version
    });

  } catch (err) {
    console.error('Save Patch Error:', err);
    res.status(500).json({ error: 'Server error saving patch.' });
  }
});

/**
 * @route   GET /api/patches/:analysisId
 * @desc    Retrieve all active patches for a repository analysis
 * @access  Private
 */
router.get('/:analysisId', auth, async (req, res) => {
  try {
    const { analysisId } = req.params;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT id, file_path, version, patch_source, is_active, notes, created_at 
       FROM user_patches 
       WHERE user_id = $1 AND analysis_id = $2 AND is_active = TRUE
       ORDER BY file_path`,
      [userId, analysisId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Patches Error:', err);
    res.status(500).json({ error: 'Server error fetching patches.' });
  }
});

/**
 * @route   GET /api/patches/:analysisId/file
 * @desc    Fetch active patch details for a specific file
 * @access  Private
 */
router.get('/:analysisId/file', auth, async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { file_path: filePath } = req.query;
    const userId = req.user.userId;

    if (!filePath) {
      return res.status(400).json({ error: 'Missing file_path query parameter.' });
    }

    const result = await db.query(
      `SELECT * FROM user_patches 
       WHERE user_id = $1 AND analysis_id = $2 AND file_path = $3 AND is_active = TRUE`,
      [userId, analysisId, filePath]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active patch found for this file.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fetch File Patch Error:', err);
    res.status(500).json({ error: 'Server error fetching file patch.' });
  }
});

/**
 * @route   GET /api/patches/:analysisId/history
 * @desc    Retrieve version history for a specific file
 * @access  Private
 */
router.get('/:analysisId/history', auth, async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { file_path: filePath } = req.query;
    const userId = req.user.userId;

    if (!filePath) {
      return res.status(400).json({ error: 'Missing file_path query parameter.' });
    }

    const result = await db.query(
      `SELECT id, version, patch_source, is_active, notes, created_at 
       FROM user_patches 
       WHERE user_id = $1 AND analysis_id = $2 AND file_path = $3
       ORDER BY version DESC`,
      [userId, analysisId, filePath]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Patch History Error:', err);
    res.status(500).json({ error: 'Server error fetching patch version history.' });
  }
});

/**
 * @route   DELETE /api/patches/:patchId
 * @desc    Revert / deactivate a patch and restore original content
 * @access  Private
 */
router.delete('/:patchId', auth, async (req, res) => {
  try {
    const { patchId } = req.params;
    const userId = req.user.userId;

    // 1. Fetch patch metadata to identify file and original content
    const patchQuery = await db.query(
      `SELECT analysis_id, file_path, original_content 
       FROM user_patches 
       WHERE id = $1 AND user_id = $2`,
      [patchId, userId]
    );

    if (patchQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Patch not found or unauthorized.' });
    }

    const { analysis_id: analysisId, file_path: filePath, original_content: originalContent } = patchQuery.rows[0];

    // 2. Fetch analysis to get github_url
    const analysisQuery = await db.query(
      `SELECT github_url FROM analyses WHERE id = $1 AND user_id = $2`,
      [analysisId, userId]
    );

    const { github_url: githubUrl } = analysisQuery.rows[0];

    // 3. Mark the target patch as inactive
    await db.query(
      `UPDATE user_patches 
       SET is_active = FALSE 
       WHERE id = $1 AND user_id = $2`,
      [patchId, userId]
    );

    // 4. Overwrite file content with original on-disk clone
    const tempCloneDir = await ensureRepoCloned(analysisId, githubUrl);
    const targetFile = path.resolve(tempCloneDir, filePath);
    await fs.writeFile(targetFile, originalContent, 'utf-8');

    res.json({ message: 'Patch successfully reverted. File restored to original.', filePath });

  } catch (err) {
    console.error('Revert Patch Error:', err);
    res.status(500).json({ error: 'Server error reverting patch.' });
  }
});

/**
 * @route   GET /api/patches/:analysisId/export
 * @desc    Zip and download the patched codebase repository
 * @access  Private
 */
router.get('/:analysisId/export', auth, async (req, res) => {
  try {
    const { analysisId } = req.params;
    const userId = req.user.userId;

    // 1. Fetch analysis details to get github_url and repo name
    const analysisQuery = await db.query(
      `SELECT repo_name, github_url FROM analyses WHERE id = $1 AND user_id = $2`,
      [analysisId, userId]
    );

    if (analysisQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found or unauthorized.' });
    }

    const { repo_name: repoName, github_url: githubUrl } = analysisQuery.rows[0];

    // 2. Ensure codebase clone exists locally
    console.log(`[Export] Rebuilding patch tree for ${repoName} (Analysis: ${analysisId})...`);
    const tempCloneDir = await ensureRepoCloned(analysisId, githubUrl);

    // 3. Retrieve all active patches for this analysis
    const activePatches = await db.query(
      `SELECT file_path, patched_content FROM user_patches 
       WHERE user_id = $1 AND analysis_id = $2 AND is_active = TRUE`,
      [userId, analysisId]
    );

    // 4. Force override of local file clone contents with stored patches
    for (const patch of activePatches.rows) {
      const targetFile = path.resolve(tempCloneDir, patch.file_path);
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.writeFile(targetFile, patch.patched_content, 'utf-8');
    }

    // 5. Initialize archiver stream and output headers
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${repoName}-patched.zip"`);

    archive.on('error', (err) => {
      console.error('[Export] Archiver stream error:', err);
      res.status(500).json({ error: 'Archiver compression failure.' });
    });

    archive.pipe(res);

    // 6. Zip directories recursively while ignoring build artifacts and .git metadata
    archive.glob('**/*', {
      cwd: tempCloneDir,
      ignore: ['.git/**', 'node_modules/**', 'dist/**', 'build/**', '.github/**']
    });

    await archive.finalize();
    console.log(`[Export] Successfully piped ZIP stream for ${repoName}.`);

  } catch (err) {
    console.error('ZIP Export Error:', err);
    // If headers haven't been sent, return JSON error
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error generating ZIP export.' });
    }
  }
});

module.exports = router;
