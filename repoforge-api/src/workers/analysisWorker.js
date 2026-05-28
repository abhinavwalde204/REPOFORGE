const path = require('path');
const db = require('../db');
const githubService = require('../services/githubService');
const parserService = require('../services/parserService');

/**
 * Worker Coordinator to handle asynchronous repository processing.
 * Designed with a fully resilient direct-execution fallback if Redis is offline.
 */
class AnalysisWorker {
  constructor() {
    this.redisAvailable = false;
    this.bullQueue = null;
  }

  /**
   * Initialize worker. Attempts to bind to local Bull/Redis.
   * If Redis fails, gracefully falls back to direct async background execution.
   */
  async init() {
    try {
      const Bull = require('bull');
      const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
      
      // Setup Queue with short connection timeout so it doesn't hang the server boot
      this.bullQueue = new Bull('repo-analysis-queue', redisUrl, {
        redis: {
          connectTimeout: 2000,
          maxRetriesPerRequest: 1
        }
      });

      // Simple ping-check connection stability
      await this.bullQueue.client.ping();
      this.redisAvailable = true;
      console.log('✅ Bull Ingestion Queue bound successfully to local Redis.');

      // Wire queue processor
      this.bullQueue.process(async (job) => {
        const { analysisId, githubUrl } = job.data;
        return this.processAnalysis(analysisId, githubUrl);
      });

    } catch (err) {
      this.redisAvailable = false;
      this.bullQueue = null;
      console.warn('⚠️  Redis/Bull connection offline. Gracefully falling back to Promise-based direct async background ingestion.');
    }
  }

  /**
   * Schedule a new analysis job.
   */
  async enqueue(analysisId, githubUrl) {
    if (this.redisAvailable && this.bullQueue) {
      try {
        await this.bullQueue.add({ analysisId, githubUrl }, {
          attempts: 2,
          removeOnComplete: true
        });
        console.log(`[Queue] Successfully enqueued job to Bull for Analysis ID: ${analysisId}`);
        return;
      } catch (err) {
        console.warn('[Queue] Bull add failed. Falling back to background trigger.', err.message);
      }
    }

    // Direct background execution fallback
    console.log(`[Queue] Triggering direct background execution for Analysis ID: ${analysisId}`);
    setImmediate(async () => {
      try {
        await this.processAnalysis(analysisId, githubUrl);
      } catch (err) {
        console.error(`[Queue] Background processing failed for Analysis ID: ${analysisId}`, err);
      }
    });
  }

  /**
   * Core workflow logic to clone, parse, analyze, and save codebase maps.
   */
  async processAnalysis(analysisId, githubUrl) {
    console.log(`[Worker] Started processing Analysis ID: ${analysisId} (${githubUrl})`);
    
    // Create a target subdirectory within our local project workspace
    const tempCloneDir = path.resolve(__dirname, `../../temp/${analysisId}`);
    
    try {
      // Step 1: Update database status to 'processing'
      await db.query(
        `UPDATE analyses SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [analysisId]
      );

      // Step 2: Clone repository
      console.log(`[Worker] Cloning repository: ${githubUrl} to ${tempCloneDir}`);
      const cloneStats = await githubService.cloneRepository(githubUrl, tempCloneDir);

      // Step 3: Extract dependency graph
      console.log(`[Worker] Parsing repository file structure...`);
      const graph = await parserService.parseDirectory(tempCloneDir);

      // Step 4: Run Deep Static Analysis (Security, Patterns, Blast Radius, Health Score)
      console.log(`[Worker] Running deep static analysis engine...`);
      const analyzerService = require('../services/analyzerService');
      const analysisResult = await analyzerService.runDeepAnalysis(graph.nodes, graph.edges, tempCloneDir);

      // Combine standard metrics with deep analysis payload
      const finalMetrics = {
        ...analysisResult.metrics,
        security_issues: analysisResult.securityIssues,
        design_patterns: analysisResult.patterns
      };

      // Step 4.5: Calculate Repo Score
      console.log(`[Worker] Calculating Repo Score (weighted 6 parameters)...`);
      const scoreService = require('../services/scoreService');
      const repoScoreJson = await scoreService.calculateRepoScore(
        analysisResult.nodes,
        analysisResult.edges,
        analysisResult.securityIssues,
        analysisResult.patterns,
        tempCloneDir
      );

      let healthGrade = 'F';
      const hs = analysisResult.healthScore;
      if (hs >= 9.0) healthGrade = 'A';
      else if (hs >= 8.0) healthGrade = 'B';
      else if (hs >= 7.0) healthGrade = 'C';
      else if (hs >= 6.0) healthGrade = 'D';

      const securityIssueCount = analysisResult.securityIssues.reduce((sum, issue) => sum + (issue.risks ? issue.risks.length : 0), 0);

      // Step 5: Save compiled graph and metrics back to database
      console.log(`[Worker] Writing parsed dependency graph and metrics into database...`);
      await db.query(
        `UPDATE analyses 
         SET status = 'completed', 
             nodes = $2::jsonb, 
             edges = $3::jsonb, 
             metrics = $4::jsonb, 
             health_score = $5,
             health_grade = $6,
             file_count = $7,
             security_issue_count = $8,
             repo_score_json = $9::jsonb,
             updated_at = NOW(),
             completed_at = NOW()
         WHERE id = $1`,
        [
          analysisId, 
          JSON.stringify(analysisResult.nodes), 
          JSON.stringify(analysisResult.edges), 
          JSON.stringify(finalMetrics), 
          analysisResult.healthScore,
          healthGrade,
          analysisResult.nodes.length,
          securityIssueCount,
          JSON.stringify(repoScoreJson)
        ]
      );

      console.log(`[Worker] Analysis completed successfully for Analysis ID: ${analysisId}`);

    } catch (err) {
      console.error(`[Worker] Error encountered in execution for Analysis ID: ${analysisId}:`, err);
      
      // Update database status to failed and store the error message
      await db.query(
        `UPDATE analyses SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
        [analysisId, err.message]
      );
    } finally {
      // Step 6: Temporarily disabled temp clone cleanup to ensure persistent access
      // to repository files in the temporary directory for RAG analysis.
      // console.log(`[Worker] Cleaning up temporary clone path: ${tempCloneDir}`);
      // await githubService.deleteDirectory(tempCloneDir);
    }
  }
}

module.exports = new AnalysisWorker();
