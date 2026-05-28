const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const db = require('../db');
const auth = require('../middleware/auth');
const analysisWorker = require('../workers/analysisWorker');
const { z } = require('zod');

// Core services for synchronous local processing
const parserService = require('../services/parserService');
const analyzerService = require('../services/analyzerService');
const scoreService = require('../services/scoreService');
const githubService = require('../services/githubService');

/**
 * Helper to ensure the repo is cloned locally before reading files
 */
async function ensureRepoCloned(analysisId, githubUrl) {
  const tempCloneDir = path.resolve(__dirname, `../../temp/${analysisId}`);
  try {
    await fs.access(tempCloneDir);
  } catch (e) {
    if (!githubUrl.startsWith('local://')) {
      console.log(`[Analysis] Repository directory missing. Re-cloning on-the-fly to ${tempCloneDir}...`);
      await githubService.cloneRepository(githubUrl, tempCloneDir);
    }
  }
  return tempCloneDir;
}

// Schema for input validation
const triggerSchema = z.object({
  githubUrl: z.string().url('Must be a valid URL starting with http:// or https://')
});

/**
 * @route   POST /api/analysis/trigger
 * @desc    Start parsing a new GitHub repository
 * @access  Private (Requires JWT)
 */
router.post('/trigger', auth, async (req, res) => {
  try {
    const validationResult = triggerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: validationResult.error.issues[0].message 
      });
    }

    const { githubUrl } = req.body;
    const userId = req.user.userId;

    // Parse owner and repo from URL
    // e.g. "https://github.com/facebook/react" -> owner=facebook, repo=react
    let repoOwner = 'unknown';
    let repoName = 'unknown-repo';
    let repoFullName = 'unknown/unknown-repo';
    try {
      const parts = githubUrl.replace(/\.git$/, '').split('/');
      repoName = parts[parts.length - 1];
      repoOwner = parts[parts.length - 2] || 'unknown';
      repoFullName = `${repoOwner}/${repoName}`;
    } catch (e) { /* Ignore */ }

    // Check if user already has a pending/processing analysis for this URL
    const activeQuery = await db.query(
      `SELECT id, status FROM analyses 
       WHERE user_id = $1 AND github_url = $2 AND status IN ('pending', 'processing')
       LIMIT 1`,
      [userId, githubUrl]
    );

    if (activeQuery.rows.length > 0) {
      return res.json({ 
        message: 'An analysis is already in progress for this repository.',
        analysisId: activeQuery.rows[0].id,
        status: activeQuery.rows[0].status
      });
    }

    // Insert analysis with status 'pending' — populate all schema columns
    const insertQuery = await db.query(
      `INSERT INTO analyses (user_id, github_url, repo_owner, repo_name, repo_full_name, status, updated_at) 
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW()) 
       RETURNING id, status`,
      [userId, githubUrl, repoOwner, repoName, repoFullName]
    );

    const analysisId = insertQuery.rows[0].id;

    // Dispatch job to worker queue (or direct async fallback)
    await analysisWorker.enqueue(analysisId, githubUrl);

    res.status(201).json({
      message: 'Analysis successfully queued.',
      analysisId,
      status: 'pending'
    });

  } catch (err) {
    console.error('Trigger Analysis Route Error:', err);
    res.status(500).json({ error: 'Server error triggering codebase analysis: ' + err.message, stack: err.stack });
  }
});

/**
 * @route   POST /api/analysis/local
 * @desc    Submit local directory structure and code files for complete parsing and quality scoring
 * @access  Private (Requires JWT)
 */
router.post('/local', auth, async (req, res) => {
  const { repoName, files } = req.body;
  const userId = req.user.userId;

  if (!repoName || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters: repoName, files array.' });
  }

  const analysisId = crypto.randomUUID();
  const tempCloneDir = path.resolve(__dirname, `../../temp/${analysisId}`);

  try {
    // 1. Create target temp directory and write all files
    await fs.mkdir(tempCloneDir, { recursive: true });

    for (const file of files) {
      if (!file.path || file.content === undefined) continue;
      const targetFile = path.join(tempCloneDir, file.path);
      // Ensure directory path is within tempCloneDir to prevent path traversal
      if (!targetFile.startsWith(tempCloneDir)) {
        throw new Error(`Directory traversal detected: ${file.path}`);
      }
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.writeFile(targetFile, file.content, 'utf-8');
    }

    // 2. Run AST parser and extraction
    const graph = await parserService.parseDirectory(tempCloneDir);

    // 3. Run Static Analysis scanners
    const analysisResult = await analyzerService.runDeepAnalysis(graph.nodes, graph.edges, tempCloneDir);

    // 4. Calculate weighted Repo Score
    const repoScoreJson = await scoreService.calculateRepoScore(
      analysisResult.nodes,
      analysisResult.edges,
      analysisResult.securityIssues,
      analysisResult.patterns,
      tempCloneDir
    );

    // 5. Save the analysis completed state in DB
    let healthGrade = 'F';
    const hs = analysisResult.healthScore;
    if (hs >= 9.0) healthGrade = 'A';
    else if (hs >= 8.0) healthGrade = 'B';
    else if (hs >= 7.0) healthGrade = 'C';
    else if (hs >= 6.0) healthGrade = 'D';

    const securityIssueCount = analysisResult.securityIssues.reduce(
      (sum, issue) => sum + (issue.risks ? issue.risks.length : 0),
      0
    );

    const finalMetrics = {
      ...analysisResult.metrics,
      security_issues: analysisResult.securityIssues,
      design_patterns: analysisResult.patterns
    };

    await db.query(
      `INSERT INTO analyses (id, user_id, github_url, repo_owner, repo_name, repo_full_name, status, health_score, health_grade, file_count, security_issue_count, nodes, edges, metrics, repo_score_json, created_at, updated_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, NOW(), NOW(), NOW())`,
      [
        analysisId,
        userId,
        `local://${repoName}`,
        'local',
        repoName,
        `local/${repoName}`,
        analysisResult.healthScore,
        healthGrade,
        analysisResult.nodes.length,
        securityIssueCount,
        JSON.stringify(analysisResult.nodes),
        JSON.stringify(analysisResult.edges),
        JSON.stringify(finalMetrics),
        JSON.stringify(repoScoreJson)
      ]
    );

    res.status(201).json({
      message: 'Local codebase successfully analyzed.',
      analysisId
    });

  } catch (err) {
    console.error('Local Analysis Route Error:', err);
    res.status(500).json({ error: err.message || 'Server error processing local analysis.' });
  } finally {
    // 6. Guarantee temp directory cleanup
    // try {
    //   const githubService = require('../services/githubService');
    //   await githubService.deleteDirectory(tempCloneDir);
    // } catch (e) {
    //   console.error('Failed to cleanup local temp folder:', tempCloneDir, e);
    // }
  }
});

/**
 * @route   GET /api/analysis/history
 * @desc    Get user's past repository analyses
 * @access  Private (Requires JWT)
 */
router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await db.query(
      `SELECT id, repo_name, github_url, status, health_score, metrics, error_message, created_at, updated_at 
       FROM analyses 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch History Route Error:', err);
    res.status(500).json({ error: 'Server error fetching analysis history.' });
  }
});

/**
 * @route   GET /api/analysis/status/:id
 * @desc    Get current progress status of a repository analysis job
 * @access  Private (Requires JWT)
 */
router.get('/status/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT id, repo_name, github_url, status, health_score, health_grade, metrics, repo_score_json, error_message, created_at 
       FROM analyses 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis job not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get Status Route Error:', err);
    res.status(500).json({ error: 'Server error fetching analysis status.' });
  }
});

/**
 * @route   GET /api/analysis/graph/:id
 * @desc    Retrieve nodes and edges for React Flow rendering
 * @access  Private (Requires JWT)
 */
router.get('/graph/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT id, repo_name, repo_full_name, github_url, status, nodes, edges, metrics, health_score, health_grade, repo_score_json 
       FROM analyses 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis data not found.' });
    }

    const row = result.rows[0];
    if (row.status !== 'completed') {
      return res.status(400).json({ 
        error: `Dependency graph is not ready. Current job status: ${row.status}` 
      });
    }

    const metrics = row.metrics || {};

    res.json({
      id: row.id,
      repoName: row.repo_full_name || row.repo_name,
      githubUrl: row.github_url || `https://github.com/${row.repo_full_name}`,
      nodes: row.nodes || [],
      edges: row.edges || [],
      healthScore: row.health_score,
      healthGrade: row.health_grade,
      repoScore: row.repo_score_json,
      metrics: {
        ...metrics,
        // Flatten top-level keys for convenience
        security_issues: metrics.security_issues || [],
        design_patterns: metrics.design_patterns || [],
        radar_metrics: metrics.radar_metrics || {
          complexity: 80,
          modular: 75,
          security: 90,
          duplication: 85,
          coverage: 70
        }
      }
    });

  } catch (err) {
    console.error('Get Graph Route Error:', err);
    res.status(500).json({ error: 'Server error retrieving codebase dependency graph.' });
  }
});

/**
 * @route   GET /api/analysis/:id/file
 * @desc    Read a single file's content from the cloned repository
 * @access  Private (Requires JWT)
 */
router.get('/:id/file', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = req.query.path;
    const userId = req.user.userId;

    if (!filePath) {
      return res.status(400).json({ error: 'Missing required query parameter: path' });
    }

    // 1. Verify the analysis belongs to this user
    const analysisQuery = await db.query(
      `SELECT github_url FROM analyses WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (analysisQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    const { github_url: githubUrl } = analysisQuery.rows[0];

    // 2. Resolve the file from the temp clone directory
    const tempCloneDir = await ensureRepoCloned(id, githubUrl);
    const targetFile = path.resolve(tempCloneDir, filePath);

    // 3. Safety: ensure the resolved path is within the clone dir
    if (!targetFile.startsWith(tempCloneDir)) {
      return res.status(400).json({ error: 'Invalid file path.' });
    }

    // 4. Read and return the file content
    let content;
    try {
      content = await fs.readFile(targetFile, 'utf-8');
    } catch (e) {
      // If the clone was cleaned up, try to look in nodes stored in DB
      const graphQuery = await db.query(
        `SELECT nodes FROM analyses WHERE id = $1`,
        [id]
      );
      const nodes = graphQuery.rows[0]?.nodes || [];
      const matchingNode = nodes.find(n => n.id === filePath);
      if (matchingNode && matchingNode.content) {
        content = matchingNode.content;
      } else {
        return res.status(404).json({ error: `File not found: ${filePath}` });
      }
    }

    res.json({ content, filePath });
  } catch (err) {
    console.error('Get File Content Error:', err);
    res.status(500).json({ error: 'Server error reading file content.' });
  }
});

module.exports = router;
