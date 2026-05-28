// src/routes/rag.js
// RAG endpoints powered by local Ollama (deepseek-coder model).
// Falls back gracefully when Ollama is offline.

const express      = require('express');
const router       = express.Router();
const path         = require('path');
const archiver     = require('archiver');
const aiService = require('../services/groqService');

// Simple in-memory chat sessions: sessionId -> { filePath, fileContent, history[] }
const chatSessions = {};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/rag/analyze
// Body: { filePath, content, tags }
// Returns a detailed AI-generated description of the file using Ollama.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const { filePath, content, tags, model } = req.body;

    if (!filePath || !content) {
      return res.status(400).json({ error: 'filePath and content are required.' });
    }

    const description = await aiService.analyzeFile(filePath, content, tags || [], model);
    res.json({ description });
  } catch (err) {
    console.error('[RAG /analyze]', err);
    res.status(500).json({ error: 'Failed to analyse file.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/rag/chat
// Body: { sessionId?, message, filePath, fileContent? }
// Returns an AI reply maintaining per-session conversation history.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { sessionId, message, filePath, fileContent, model } = req.body;

    if (!message || !filePath) {
      return res.status(400).json({ error: 'message and filePath are required.' });
    }

    // Retrieve or initialise session
    const sid = sessionId || `session_${Date.now()}`;
    if (!chatSessions[sid]) {
      chatSessions[sid] = { filePath, fileContent: fileContent || '', history: [] };
    }

    const session = chatSessions[sid];
    // If fileContent was freshly provided (e.g., user navigated to a new file), update it
    if (fileContent) session.fileContent = fileContent;

    // Get AI reply
    const reply = await aiService.chat(
      session.filePath,
      session.fileContent,
      session.history,
      message,
      model
    );

    // Persist turn to history
    session.history.push({ role: 'user',      content: message });
    session.history.push({ role: 'assistant', content: reply   });

    // Keep history bounded to last 20 messages to avoid huge contexts
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    res.json({ reply, sessionId: sid });
  } catch (err) {
    console.error('[RAG /chat]', err);
    res.status(500).json({ error: 'Failed to process chat message.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/rag/repo/download/:analysisId
// Streams a zip of the analyzed repository (excludes .git folder).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/repo/download/:analysisId', async (req, res) => {
  const { analysisId } = req.params;
  const repoRoot = path.resolve(__dirname, `../../temp/${analysisId}`);
  const fs = require('fs');

  // 1. Verify the directory exists before touching the response
  try {
    await fs.promises.access(repoRoot);
  } catch (err) {
    return res.status(404).json({ error: 'Repository directory not found. The temp clone may have been cleaned up.' });
  }

  // 2. Stat to confirm it's actually a directory
  try {
    const stat = await fs.promises.stat(repoRoot);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Analysis path is not a valid directory.' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stat repository directory.' });
  }

  // 3. Stream the zip — headers must be set before piping
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="repo-${analysisId}.zip"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('warning', (err) => {
    // ENOENT warnings are non-fatal; log and continue
    if (err.code !== 'ENOENT') {
      console.warn('[RAG /repo/download] Archiver warning:', err);
    }
  });

  archive.on('error', err => {
    console.error('[RAG /repo/download] Archiver error:', err);
    // Cannot set status once headers are sent — just destroy the connection
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to create archive: ${err.message}` });
    } else {
      res.destroy(err);
    }
  });

  archive.on('finish', () => {
    console.log(`[RAG /repo/download] Archive sent for ${analysisId} (${archive.pointer()} bytes)`);
  });

  archive.pipe(res);

  // Glob pattern to exclude .git folder and its contents
  archive.glob('**/*', {
    cwd: repoRoot,
    dot: true,
    ignore: ['.git/**', '.git'],
    nodir: false,
  });

  await archive.finalize();
});

module.exports = router;
