const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const migrate = require('./src/db/migrate');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const app = express();
// EB Nginx proxies to 8080 — use 8080 as the universal default
const PORT = parseInt(process.env.PORT, 10) || 8080;

// Enable security and parsing middleware
// Enable security and parsing middleware (production only to avoid local dev blocks)
if (process.env.NODE_ENV !== 'development') {
  app.use(helmet());
}
app.use(cors({
  origin: (origin, callback) => {
    // For this project, allow all origins to prevent S3 / Amplify deployment CORS issues
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Track boot status for diagnostics
const bootStatus = { db: 'pending', worker: 'pending', errors: [] };

// Root endpoint – provides a friendly message
app.get('/', (req, res) => {
  res.status(200).json({ message: 'RepoForge API is running', version: '1.0.0' });
});

// Diagnostic endpoint to debug deployment issues
app.get('/debug', (req, res) => {
  res.status(200).json({
    port: PORT,
    nodeEnv: process.env.NODE_ENV,
    hasDbUrl: !!process.env.DATABASE_URL,
    dbUrlHost: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'N/A',
    hasRedisUrl: !!process.env.REDIS_URL,
    bootStatus,
    timestamp: new Date()
  });
});

// Import route blueprints
const authRoutes = require('./src/routes/auth');
const ragRoutes = require('./src/routes/rag');
const analysisRoutes = require('./src/routes/analysis');
const editorRoutes = require('./src/routes/editor');
const shareRoutes = require('./src/routes/share');
const patchesRoutes = require('./src/routes/patches');

// Bind API routing namespaces
app.use('/api/auth', authRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/editor', editorRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/patches', patchesRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Catch‑all for unknown paths (after all routes)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Bootstrap: Start server FIRST, then attempt DB + Worker connections
const bootstrap = async () => {
  // 1. Start the HTTP server immediately so EB health checks pass
  app.listen(PORT, () => {
    console.log(`RepoForge API Server running on port ${PORT}`);
  });

  // 2. Attempt database migration (non-fatal)
  try {
    await migrate();
    bootStatus.db = 'connected';
    console.log('✅ Database migration completed successfully.');
  } catch (error) {
    bootStatus.db = 'failed';
    bootStatus.errors.push(`DB: ${error.message}`);
    console.error('⚠️  Database migration failed (server still running):', error.message);
  }

  // 3. Attempt worker/Redis initialization (non-fatal)
  try {
    const analysisWorker = require('./src/workers/analysisWorker');
    await analysisWorker.init();
    bootStatus.worker = 'connected';
  } catch (error) {
    bootStatus.worker = 'failed';
    bootStatus.errors.push(`Worker: ${error.message}`);
    console.error('⚠️  Worker initialization failed (server still running):', error.message);
  }
};

bootstrap();
