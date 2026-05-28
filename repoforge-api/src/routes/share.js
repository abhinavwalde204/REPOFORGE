const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const auth = require('../middleware/auth');

/**
 * @route   POST /api/share
 * @desc    Generate a public share token for a completed repository analysis
 * @access  Private (Requires JWT)
 */
router.post('/trigger', auth, async (req, res) => {
  try {
    const { analysisId } = req.body;
    const userId = req.user.userId;

    if (!analysisId) {
      return res.status(400).json({ error: 'Missing analysisId parameter.' });
    }

    // Verify the analysis belongs to the user and is completed
    const analysisCheck = await db.query(
      `SELECT id, status FROM analyses WHERE id = $1 AND user_id = $2`,
      [analysisId, userId]
    );

    if (analysisCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found or unauthorized.' });
    }

    if (analysisCheck.rows[0].status !== 'completed') {
      return res.status(400).json({ error: 'Only completed analyses can be shared.' });
    }

    // Check if a share token already exists for this analysis
    const existingShare = await db.query(
      `SELECT share_token FROM shared_analyses WHERE analysis_id = $1 LIMIT 1`,
      [analysisId]
    );

    let token = '';
    if (existingShare.rows.length > 0) {
      token = existingShare.rows[0].share_token;
    } else {
      // Generate a new secure random token
      token = crypto.randomBytes(32).toString('hex');
      await db.query(
        `INSERT INTO shared_analyses (analysis_id, share_token) VALUES ($1, $2)`,
        [analysisId, token]
      );
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const shareUrl = `${frontendUrl}/shared/${token}`;

    res.json({ shareUrl, token });

  } catch (err) {
    console.error('Create Share Error:', err);
    res.status(500).json({ error: 'Server error generating share link.' });
  }
});

/**
 * @route   GET /api/share/:token
 * @desc    Fetch a shared analysis dependency graph publicly without auth
 * @access  Public
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Missing token parameter.' });
    }

    // Perform join query to fetch analysis details
    const result = await db.query(
      `SELECT sa.id AS share_id, sa.created_at AS shared_at,
              a.id AS analysis_id, a.repo_name, a.repo_full_name, a.github_url, a.status, a.nodes, a.edges, a.metrics, a.health_score, a.health_grade, a.repo_score_json
       FROM shared_analyses sa
       JOIN analyses a ON sa.analysis_id = a.id
       WHERE sa.share_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shared analysis not found or link has expired.' });
    }

    const row = result.rows[0];
    const metrics = row.metrics || {};

    res.json({
      id: row.analysis_id,
      repoName: row.repo_full_name || row.repo_name,
      githubUrl: row.github_url || `https://github.com/${row.repo_full_name}`,
      nodes: row.nodes || [],
      edges: row.edges || [],
      healthScore: row.health_score,
      healthGrade: row.health_grade,
      repoScore: row.repo_score_json,
      metrics: {
        ...metrics,
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
    console.error('Fetch Shared Analysis Error:', err);
    res.status(500).json({ error: 'Server error fetching shared analysis.' });
  }
});

module.exports = router;
