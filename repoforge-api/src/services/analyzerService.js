const fs = require('fs').promises;

/**
 * Advanced codebase static analysis engine.
 */
class AnalyzerService {
  /**
   * Run the full analysis pipeline on the parsed graph and file contents.
   */
  async runDeepAnalysis(nodes, edges, rootDir) {
    // 1. Compute Blast Radius (BFS Cycle/Dependency Impact)
    const blastRadiusMap = this.computeBlastRadius(nodes, edges);

    // 2. Security & Design Pattern Static Scanning
    const securityIssues = [];
    const patterns = [];

    // Initialize line duplication and test framework tracking
    const lineHashes = {};
    let totalLinesScanned = 0;
    let duplicateLinesCount = 0;
    let testFilesCount = 0;
    let usesTestingLibrary = false;

    for (const node of nodes) {
      try {
        const filePath = `${rootDir}/${node.id}`;
        const content = await fs.readFile(filePath, 'utf-8');

        // Check if test file
        const isTestFile = node.id.includes('.test.') || 
                           node.id.includes('.spec.') || 
                           node.id.includes('test_') || 
                           node.id.startsWith('tests/') ||
                           node.id.startsWith('test/');
        if (isTestFile) {
          testFilesCount++;
        }

        // Check package.json / requirements / setup.py for testing frameworks
        if (node.id === 'package.json') {
          if (/jest|mocha|vitest|cypress|playwright|jasmine|ava|tape/.test(content)) {
            usesTestingLibrary = true;
          }
        } else if (node.id === 'requirements.txt' || node.id === 'setup.py' || node.id === 'Pipfile') {
          if (/pytest|unittest|nose|tox/.test(content)) {
            usesTestingLibrary = true;
          }
        }

        // Extract Patterns
        const detectedPatterns = this.detectDesignPatterns(content, node.language);
        if (detectedPatterns.length > 0) {
          patterns.push({
            file: node.id,
            patterns: detectedPatterns
          });
        }

        // Extract Security Risks
        const detectedRisks = this.detectSecurityRisks(content, node.language);
        if (detectedRisks.length > 0) {
          securityIssues.push({
            file: node.id,
            risks: detectedRisks
          });
        }

        // Scan for duplicates (minimum length of 20 chars, ignore common boilerplate lines)
        const lines = content.split('\n');
        for (let line of lines) {
          line = line.trim();
          if (line.length > 20 && 
              !line.startsWith('import ') && 
              !line.startsWith('const ') && 
              !line.startsWith('require(') && 
              !line.startsWith('export ') &&
              !line.startsWith('from ')) {
            totalLinesScanned++;
            if (lineHashes[line]) {
              duplicateLinesCount++;
              lineHashes[line]++;
            } else {
              lineHashes[line] = 1;
            }
          }
        }

      } catch (err) {
        // Skip files that fail to read (e.g. binary or missing)
      }
    }

    // Assign blast radius back to nodes for visualization
    for (const node of nodes) {
      node.blastRadius = blastRadiusMap[node.id] || 0;
    }

    // Calculate duplication score (100 is best, 0 is worst)
    const duplicateRatio = totalLinesScanned > 0 ? (duplicateLinesCount / totalLinesScanned) : 0;
    const duplicationScore = Math.max(10, Math.min(100, Math.round(100 - (duplicateRatio * 300)))); // Up to 30% duplication drops score to 10%

    // Calculate test coverage score (100 is best, 0 is worst)
    const totalFiles = nodes.length;
    const totalImplementationFiles = Math.max(1, totalFiles - testFilesCount);
    let coverageScore = 0;
    if (testFilesCount > 0) {
      const ratio = testFilesCount / totalImplementationFiles;
      coverageScore = Math.min(95, Math.round(ratio * 250)); // e.g. 20% test files => 50% coverage
      if (usesTestingLibrary) {
        coverageScore = Math.min(98, coverageScore + 15);
      }
    } else {
      coverageScore = usesTestingLibrary ? 35 : 10; // Baseline if we detect a library config but no files analyzed
    }

    // 3. Compute final Health Score formula
    const healthMetrics = this.computeHealthScore(nodes, edges, securityIssues, patterns, duplicationScore, coverageScore);

    return {
      nodes,
      edges,
      securityIssues,
      patterns,
      metrics: healthMetrics.metrics,
      healthScore: healthMetrics.score
    };
  }

  /**
   * Computes the "Blast Radius" (number of upstream files that depend on this file).
   * Maps child -> list of parents using BFS.
   */
  computeBlastRadius(nodes, edges) {
    // Build reverse adjacency list: target -> list of sources (who depends on me)
    const reverseAdjList = {};
    for (const edge of edges) {
      if (!reverseAdjList[edge.target]) {
        reverseAdjList[edge.target] = [];
      }
      reverseAdjList[edge.target].push(edge.source);
    }

    const blastRadius = {};

    for (const node of nodes) {
      // BFS to find all distinct reachable nodes traversing backwards
      const visited = new Set();
      const queue = [node.id];

      while (queue.length > 0) {
        const current = queue.shift();
        const dependents = reverseAdjList[current] || [];
        
        for (const dep of dependents) {
          if (!visited.has(dep) && dep !== node.id) {
            visited.add(dep);
            queue.push(dep);
          }
        }
      }

      blastRadius[node.id] = visited.size;
    }

    return blastRadius;
  }

  /**
   * Regex heuristic detection for common architectural patterns.
   */
  detectDesignPatterns(content, language) {
    const found = [];
    if (language === 'javascript') {
      if (/const\s+\[\w+,\s*set\w+\]\s*=\s*useState/.test(content) || /useEffect\(/.test(content)) found.push('React Hooks');
      if (/if\s*\(!\w+\.instance\)\s*\{/.test(content)) found.push('Singleton');
      if (/(?:create|factory|build)\w*\s*\([^)]*\)\s*\{[\s\S]{0,300}?return\s+new\s+\w+/.test(content)) found.push('Factory Pattern');
      if (/export\s+const\s+\w+Slice\s*=\s*createSlice/.test(content)) found.push('Redux Slice');
    } else if (language === 'python') {
      if (/_instance\s*=\s*None[\s\S]{0,300}?def\s+__new__/.test(content)) found.push('Singleton');
      if (/@(?:classmethod|staticmethod)\s*def\s+(?:create|build)/.test(content)) found.push('Factory Pattern');
      if (/class\s+\w+\(models\.Model\):/.test(content)) found.push('Django Model');
    }
    return found;
  }

  /**
   * Static analysis for obvious security misconfigurations.
   */
  detectSecurityRisks(content, language) {
    const risks = [];
    // Hardcoded secrets (AWS Keys, Bearer tokens)
    if (/(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/.test(content)) {
      risks.push({ type: 'Hardcoded AWS Access Key', severity: 'critical' });
    }
    if (/Bearer\s+[a-zA-Z0-9\-\._~+\/]+=*/.test(content)) {
      risks.push({ type: 'Hardcoded Bearer Token', severity: 'high' });
    }
    
    // Dangerous Executions
    if (language === 'javascript' && /eval\(/.test(content)) {
      risks.push({ type: 'Dangerous eval() usage', severity: 'critical' });
    }
    if (language === 'python' && /(eval\(|exec\()/.test(content)) {
      risks.push({ type: 'Dangerous eval()/exec() usage', severity: 'critical' });
    }

    // SQLi risk detection (string concat in query-like strings)
    if (/(SELECT|INSERT|UPDATE|DELETE).*\+.*(?:req|input|args)/i.test(content)) {
      risks.push({ type: 'Potential SQL Injection (String Concatenation)', severity: 'high' });
    }

    return risks;
  }

  /**
   * Calculate the holistic weighted Repo Health Score (0.0 to 10.0).
   */
  computeHealthScore(nodes, edges, securityIssues, patterns, duplicationScore, coverageScore) {
    let score = 10.0;
    
    const totalFiles = nodes.length;
    if (totalFiles === 0) return { score: 10, metrics: {} };

    // 1. God Module Penalty
    const godFilesCount = nodes.filter(n => n.complexity === 'high').length;
    const godRatio = godFilesCount / totalFiles;
    if (godRatio > 0.05) score -= 1.5; // More than 5% god files is very bad
    else if (godRatio > 0) score -= (godRatio * 20);

    // 2. High Blast Radius Penalty (Tight coupling)
    let tightCouplingCount = 0;
    for (const node of nodes) {
      if (totalFiles > 10 && node.blastRadius > (totalFiles * 0.3)) {
        tightCouplingCount++;
      }
    }
    if (tightCouplingCount > 0) {
      score -= Math.min(2.0, (tightCouplingCount * 0.2));
    }

    // 3. Security Penalties (Critical = -2, High = -1)
    let criticalCount = 0;
    let highCount = 0;
    securityIssues.forEach(issue => {
      issue.risks.forEach(r => {
        if (r.severity === 'critical') criticalCount++;
        else if (r.severity === 'high') highCount++;
      });
    });
    score -= (criticalCount * 2.0);
    score -= (highCount * 1.0);

    // 4. Duplication & Coverage Penalties
    if (duplicationScore < 70) {
      score -= Math.min(1.5, Number(((70 - duplicationScore) * 0.05).toFixed(2)));
    }
    if (coverageScore < 40) {
      score -= Math.min(1.0, Number(((40 - coverageScore) * 0.025).toFixed(2)));
    }

    // Bound the score safely
    score = Math.max(0.0, Math.min(10.0, score));

    // Calculate detailed radar metrics (0-100 scale)
    const complexityScore = Math.max(0, 100 - (godRatio * 500)); // 20% god files = 0
    const modularScore = Math.max(0, 100 - (tightCouplingCount * (100/totalFiles) * 2));
    const securityScore = Math.max(0, 100 - (criticalCount * 30) - (highCount * 15));

    return {
      score: Number(score.toFixed(1)),
      metrics: {
        total_files: totalFiles,
        total_loc: nodes.reduce((sum, n) => sum + n.loc, 0),
        god_modules_count: godFilesCount,
        critical_security_flags: criticalCount,
        high_security_flags: highCount,
        radar_metrics: {
          complexity: Number(complexityScore.toFixed(0)),
          modular: Number(modularScore.toFixed(0)),
          security: Number(securityScore.toFixed(0)),
          duplication: Number(duplicationScore),
          coverage: Number(coverageScore)
        }
      }
    };
  }
}

module.exports = new AnalyzerService();
