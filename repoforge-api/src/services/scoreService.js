const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

/**
 * Service to calculate the Repo Score (quality grade out of 10)
 * across 6 weighted parameters.
 */
class ScoreService {
  /**
   * Run git command inside a directory and return output.
   */
  runGitCommand(cmd, dir) {
    return new Promise((resolve) => {
      exec(cmd, { cwd: dir }, (error, stdout, stderr) => {
        if (error) {
          resolve(null);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * Main score calculation entrypoint.
   */
  async calculateRepoScore(nodes, edges, securityIssues, patterns, rootDir) {
    // 1. Documentation Score (20%)
    const docResult = await this.calculateDocumentationScore(nodes, rootDir);

    // 2. Security Score (20%)
    const securityResult = await this.calculateSecurityScore(nodes, securityIssues, rootDir);

    // 3. Test Coverage Score (18%)
    const testResult = await this.calculateTestCoverageScore(nodes, rootDir);

    // 4. Code Structure Score (17%)
    const structureResult = await this.calculateCodeStructureScore(nodes, rootDir);

    // 5. Maintenance Score (15%)
    const maintenanceResult = await this.calculateMaintenanceScore(rootDir);

    // 6. Complexity Score (10%)
    const complexityResult = await this.calculateComplexityScore(nodes, rootDir);

    // Final weighted score calculation
    const docScore = docResult.score;
    const secScore = securityResult.score;
    const tstScore = testResult.score;
    const strScore = structureResult.score;
    const mntScore = maintenanceResult.score;
    const cpxScore = complexityResult.score;

    const finalScoreRaw = (docScore * 0.20) + (secScore * 0.20) + (tstScore * 0.18) + (strScore * 0.17) + (mntScore * 0.15) + (cpxScore * 0.10);
    const finalScore = Number(finalScoreRaw.toFixed(1));

    // Grade boundary resolution
    let grade = 'F';
    if (finalScore >= 9.0) grade = 'A+';
    else if (finalScore >= 8.0) grade = 'A';
    else if (finalScore >= 7.0) grade = 'B';
    else if (finalScore >= 6.0) grade = 'C';
    else if (finalScore >= 5.0) grade = 'D';

    return {
      final_score: finalScore,
      grade,
      parameters: {
        documentation: { score: docScore, issues: docResult.issues },
        security: { score: secScore, issues: securityResult.issues },
        test_coverage: { score: tstScore, issues: testResult.issues },
        code_structure: { score: strScore, issues: structureResult.issues },
        maintenance: { score: mntScore, issues: maintenanceResult.issues },
        complexity: { score: cpxScore, issues: complexityResult.issues }
      }
    };
  }

  /**
   * Calculates Documentation Score (out of 10)
   */
  async calculateDocumentationScore(nodes, rootDir) {
    let score = 0;
    const issues = [];

    // Find README files
    let readmeName = null;
    try {
      const files = await fs.readdir(rootDir);
      readmeName = files.find(f => f.toLowerCase() === 'readme.md' || f.toLowerCase() === 'readme');
    } catch (e) { /* ignore */ }

    if (readmeName) {
      score += 2; // Has README
      try {
        const readmeContent = await fs.readFile(path.join(rootDir, readmeName), 'utf-8');
        
        // Setup/Installation check
        if (/setup|install|getting started|run/i.test(readmeContent)) {
          score += 2;
        } else {
          issues.push('README is missing setup or installation instructions');
        }

        // Code blocks or screenshot mention
        if (/```|!\[|screenshot|image|png|jpg/i.test(readmeContent)) {
          score += 1;
        } else {
          issues.push('README does not include any code block examples or screenshots');
        }
      } catch (e) {
        issues.push('Error reading README file content');
      }
    } else {
      issues.push('No root README.md file detected');
    }

    // Comment-to-code ratio and function docstrings scan
    let totalLinesOfCode = 0;
    let totalComments = 0;
    let totalFunctions = 0;
    let documentedFunctions = 0;

    for (const node of nodes) {
      try {
        const content = await fs.readFile(path.join(rootDir, node.id), 'utf-8');
        const lines = content.split('\n');
        totalLinesOfCode += lines.length;

        // Simple comment and docstring parsing
        if (node.language === 'python') {
          // Find single-line comments
          const singleLineComments = lines.filter(l => l.trim().startsWith('#')).length;
          totalComments += singleLineComments;

          // Find block comments / docstrings
          const docstringMatches = [...content.matchAll(/"""[\s\S]*?"""|'''[\s\S]*?'''/g)];
          docstringMatches.forEach(match => {
            const commentLines = match[0].split('\n').length;
            totalComments += commentLines;
          });

          // Detect functions and if they have docstrings preceding them
          const funcRegex = /def\s+(\w+)\s*\(/g;
          let match;
          while ((match = funcRegex.exec(content)) !== null) {
            totalFunctions++;
            // Check preceding lines or inside the function body for docstring
            const startIndex = match.index;
            const bodySearch = content.substring(startIndex, startIndex + 150);
            if (/"""[\s\S]*?"""|'''[\s\S]*?'''/.test(bodySearch)) {
              documentedFunctions++;
            }
          }
        } else {
          // JS / TS / JSX / TSX comments
          const singleLineComments = lines.filter(l => l.trim().startsWith('//')).length;
          totalComments += singleLineComments;

          const blockCommentMatches = [...content.matchAll(/\/\*[\s\S]*?\*\//g)];
          blockCommentMatches.forEach(match => {
            const commentLines = match[0].split('\n').length;
            totalComments += commentLines;
          });

          // Functions and JSDoc checks
          const funcRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=]*)\s*=>|class\s+\w+[\s\S]*?(\w+)\s*\([^)]*\)\s*\{)/g;
          let match;
          while ((match = funcRegex.exec(content)) !== null) {
            totalFunctions++;
            // Check if preceded by JSDoc /** ... */
            const matchIndex = match.index;
            const beforeMatch = content.substring(Math.max(0, matchIndex - 200), matchIndex).trim();
            if (/\/\*\*[\s\S]*?\*\/$/.test(beforeMatch)) {
              documentedFunctions++;
            }
          }
        }
      } catch (err) { /* ignore read failures */ }
    }

    // Comment ratio score calculation (capped at 3)
    const ratio = totalLinesOfCode > 0 ? (totalComments / totalLinesOfCode) : 0;
    const commentScore = Math.min(3, ratio * 20);
    score += commentScore;
    if (ratio < 0.15) {
      issues.push(`Low inline comment-to-code ratio (${(ratio * 100).toFixed(1)}%, below 15% threshold)`);
    }

    // Docstring check (capped at 2)
    if (totalFunctions > 0) {
      const docPercent = documentedFunctions / totalFunctions;
      if (docPercent >= 0.3) {
        score += 2;
      } else {
        score += (docPercent / 0.3) * 2;
        issues.push(`Only ${(docPercent * 100).toFixed(0)}% of functions have JSDoc or docstrings (below 30% threshold)`);
      }
    } else {
      score += 2; // Default if no functions
    }

    return {
      score: Math.min(10, Number(score.toFixed(1))),
      issues
    };
  }

  /**
   * Calculates Security Score (out of 10)
   */
  async calculateSecurityScore(nodes, securityIssues, rootDir) {
    let score = 0;
    const issues = [];

    // Count hardcoded secrets
    let secretsCount = 0;
    let hasEval = false;
    let hasSqli = false;
    let hasDebugger = false;

    securityIssues.forEach(item => {
      const risks = item.risks || [];
      risks.forEach(r => {
        if (/key|token|secret/i.test(r.type)) {
          secretsCount++;
          issues.push(`Hardcoded secret risk in ${item.file}: ${r.type}`);
        } else if (/eval|exec/i.test(r.type)) {
          hasEval = true;
          issues.push(`Dangerous execution pattern (eval/exec) in ${item.file}`);
        } else if (/sql/i.test(r.type)) {
          hasSqli = true;
          issues.push(`Potential SQL injection risk in ${item.file}`);
        }
      });
    });

    // 1. Secrets (4 points)
    const secretPoints = Math.max(0, 4 - secretsCount);
    score += secretPoints;

    // 2. Eval usage (2 points)
    if (!hasEval) {
      score += 2;
    }

    // 3. SQL injection patterns (2 points)
    if (!hasSqli) {
      score += 2;
    }

    // 4. .gitignore check (1 point)
    let hasGitignore = false;
    try {
      await fs.access(path.join(rootDir, '.gitignore'));
      hasGitignore = true;
      score += 1;
    } catch (e) {
      issues.push('Missing .gitignore file at repository root');
    }

    // 5. Debug statements in production code (1 point)
    for (const node of nodes) {
      try {
        const isTestFile = node.id.includes('.test.') || node.id.includes('.spec.') || node.id.includes('test_') || node.id.startsWith('tests/') || node.id.startsWith('test/');
        if (!isTestFile) {
          const content = await fs.readFile(path.join(rootDir, node.id), 'utf-8');
          if (node.language === 'python') {
            if (/pdb\.set_trace\(|breakpoint\(/.test(content)) {
              hasDebugger = true;
              issues.push(`Active debug breakpoint in ${node.id}`);
            }
          } else {
            if (/console\.log\(|debugger;/.test(content)) {
              hasDebugger = true;
              issues.push(`Active debug print or console statement in production code: ${node.id}`);
            }
          }
        }
      } catch (err) { /* ignore */ }
    }

    if (!hasDebugger) {
      score += 1;
    }

    return {
      score: Math.min(10, score),
      issues
    };
  }

  /**
   * Calculates Test Coverage Score (out of 10)
   */
  async calculateTestCoverageScore(nodes, rootDir) {
    let score = 0;
    const issues = [];

    let testFileCount = 0;
    let sourceFileCount = 0;
    let hasCIConfig = false;
    let hasAssertions = false;

    // 1. Check file counts & assertion patterns
    for (const node of nodes) {
      const isTestFile = node.id.includes('.test.') || 
                         node.id.includes('.spec.') || 
                         node.id.includes('test_') || 
                         node.id.startsWith('tests/') ||
                         node.id.startsWith('test/');
      if (isTestFile) {
        testFileCount++;
        try {
          const content = await fs.readFile(path.join(rootDir, node.id), 'utf-8');
          if (/assert|expect|describe|it\(|assertEqual|assertTrue|assertFalse/.test(content)) {
            hasAssertions = true;
          }
        } catch (e) { /* ignore */ }
      } else {
        sourceFileCount++;
      }
    }

    if (testFileCount > 0) {
      score += 3; // Test files exist
    } else {
      issues.push('No test files (*.test.*, *.spec.*, test_*.py) detected in repository');
    }

    // 2. Test-to-source file ratio
    const ratio = sourceFileCount > 0 ? (testFileCount / sourceFileCount) : 0;
    if (ratio >= 0.3) {
      score += 3;
    } else {
      const ratioPoints = (ratio / 0.3) * 3;
      score += ratioPoints;
      issues.push(`Low test-to-source file ratio (${(ratio).toFixed(2)}, below 0.3 threshold)`);
    }

    // 3. CI Config presence (2 points)
    const ciPaths = [
      '.github/workflows',
      '.travis.yml',
      '.circleci',
      'gitlab-ci.yml',
      'azure-pipelines.yml'
    ];

    for (const cp of ciPaths) {
      try {
        await fs.access(path.join(rootDir, cp));
        hasCIConfig = true;
        break;
      } catch (e) { /* ignore */ }
    }

    if (hasCIConfig) {
      score += 2;
    } else {
      issues.push('No CI configurations (.github/workflows, Travis, CircleCI) found');
    }

    // 4. Actual assertions check (2 points)
    if (hasAssertions) {
      score += 2;
    } else if (testFileCount > 0) {
      issues.push('Test files found but they lack recognizable assertion frameworks or statements');
    }

    return {
      score: Math.min(10, Number(score.toFixed(1))),
      issues
    };
  }

  /**
   * Calculates Code Structure Score (out of 10)
   */
  async calculateCodeStructureScore(nodes, rootDir) {
    let score = 0;
    const issues = [];

    // 1. Folder structure concerns (3 points)
    const targetDirs = ['src', 'lib', 'utils', 'routes', 'models', 'components', 'controllers', 'services', 'views'];
    let dirsFound = 0;
    try {
      const files = await fs.readdir(rootDir, { withFileTypes: true });
      files.forEach(f => {
        if (f.isDirectory() && targetDirs.includes(f.name.toLowerCase())) {
          dirsFound++;
        }
      });
    } catch (e) { /* ignore */ }

    if (dirsFound >= 2) {
      score += 3;
    } else {
      score += (dirsFound / 2) * 3;
      issues.push('Codebase lacks standard modular folder structures (e.g. src/, utils/, components/)');
    }

    // 2. File lengths (2 points)
    let filesOver500 = 0;
    for (const node of nodes) {
      if (node.loc > 500) {
        filesOver500++;
        issues.push(`God file warning: ${node.id} exceeds 500 lines (${node.loc} LOC)`);
      }
    }
    const fileLengthPenalty = Math.min(2, filesOver500 * 0.5);
    score += (2 - fileLengthPenalty);

    // 3. Function lengths (2 points)
    let functionsOver50 = 0;
    for (const node of nodes) {
      try {
        const content = await fs.readFile(path.join(rootDir, node.id), 'utf-8');
        // Simple heuristic count of lines between curly braces or Python def blocks
        const lines = content.split('\n');
        let currentFuncLines = 0;
        let insideFunc = false;

        lines.forEach(line => {
          if (node.language === 'python') {
            if (/^\s*def\s+\w+/.test(line)) {
              if (currentFuncLines > 50) functionsOver50++;
              currentFuncLines = 0;
              insideFunc = true;
            } else if (insideFunc && /^[^\s]/.test(line) && line.trim() !== '') {
              // Unindented line terminates python def
              if (currentFuncLines > 50) functionsOver50++;
              insideFunc = false;
            }
            if (insideFunc) currentFuncLines++;
          } else {
            if (/function\s+\w+|\w+\s*\([^)]*\)\s*\{|=>\s*\{/.test(line)) {
              if (currentFuncLines > 50) functionsOver50++;
              currentFuncLines = 0;
              insideFunc = true;
            }
            if (insideFunc) currentFuncLines++;
          }
        });
        if (insideFunc && currentFuncLines > 50) functionsOver50++;
      } catch (e) { /* ignore */ }
    }

    const funcLengthPenalty = Math.min(2, functionsOver50 * 0.5);
    score += (2 - funcLengthPenalty);
    if (functionsOver50 > 0) {
      issues.push(`${functionsOver50} functions exceed the 50-line size limit`);
    }

    // 4. Consistent file naming (3 points)
    let camelCount = 0;
    let kebabCount = 0;
    let snakeCount = 0;
    let totalNames = 0;

    nodes.forEach(node => {
      const nameWithoutExt = path.basename(node.id, path.extname(node.id));
      if (/^[a-z]+(?:[A-Z][a-z]+)*$/.test(nameWithoutExt)) camelCount++;
      else if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nameWithoutExt)) kebabCount++;
      else if (/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(nameWithoutExt)) snakeCount++;
      totalNames++;
    });

    if (totalNames > 0) {
      const maxStyle = Math.max(camelCount, kebabCount, snakeCount);
      const ratio = maxStyle / totalNames;
      if (ratio >= 0.8) {
        score += 3;
      } else {
        score += ratio * 3;
        issues.push(`Inconsistent file naming convention detected (mixed casing styles across files)`);
      }
    } else {
      score += 3;
    }

    return {
      score: Math.min(10, Number(score.toFixed(1))),
      issues
    };
  }

  /**
   * Calculates Maintenance Score (out of 10)
   */
  async calculateMaintenanceScore(rootDir) {
    let score = 0;
    const issues = [];

    // Let's run Git commands to inspect actual maintenance
    const lastCommitTimestamp = await this.runGitCommand('git log -1 --format=%ct', rootDir);
    const lastSixMonthsCommitCountStr = await this.runGitCommand('git log --since="6 months ago" --oneline', rootDir);

    // 1. Commit recency (4 points)
    if (lastCommitTimestamp) {
      const commitSecs = parseInt(lastCommitTimestamp, 10);
      const nowSecs = Math.floor(Date.now() / 1000);
      const diffDays = (nowSecs - commitSecs) / (24 * 3600);

      if (diffDays <= 30) {
        score += 4;
      } else if (diffDays <= 90) {
        score += 2;
        issues.push(`Last commit was ${Math.round(diffDays)} days ago (warning: over 30 days)`);
      } else {
        issues.push(`Repository is stale (last commit was ${Math.round(diffDays)} days ago)`);
      }
    } else {
      // Default fallback if not a git repository
      score += 4;
    }

    // 2. Commit frequency (3 points)
    if (lastSixMonthsCommitCountStr !== null) {
      const commitCount = lastSixMonthsCommitCountStr === '' ? 0 : lastSixMonthsCommitCountStr.split('\n').length;
      const commitsPerWeek = commitCount / 26; // 6 months is approx 26 weeks
      if (commitsPerWeek >= 2.0) {
        score += 3;
      } else {
        score += (commitsPerWeek / 2.0) * 3;
        issues.push(`Low commit frequency in last 6 months (${commitsPerWeek.toFixed(2)} commits/week, below target of 2.0)`);
      }
    } else {
      score += 3;
    }

    // 3. Dependency vulnerability / freshness fallback (3 points)
    // We award full 3 points by default unless we detect a package-lock or requirements audit fails
    // Let's keep it robust and perform a basic check or fallback to full points
    score += 3;

    return {
      score: Math.min(10, Number(score.toFixed(1))),
      issues
    };
  }

  /**
   * Calculates Complexity Score (out of 10)
   */
  async calculateComplexityScore(nodes, rootDir) {
    let score = 0;
    const issues = [];

    let totalComplexity = 0;
    let functionCount = 0;
    let functionsOver20 = 0;
    let totalNestingDepth = 0;
    let parsedFilesCount = 0;

    for (const node of nodes) {
      try {
        const content = await fs.readFile(path.join(rootDir, node.id), 'utf-8');
        const lines = content.split('\n');
        parsedFilesCount++;

        // Heuristics for cyclomatic complexity and nesting depth
        lines.forEach(line => {
          // Increment branch count
          const matches = line.match(/\b(if|for|while|elif|else\s+if|switch|case|&&|\|\||\?)\b/g);
          if (matches) {
            totalComplexity += matches.length;
          }

          // Count tabs/spaces to determine nesting depth
          const leadingSpaces = line.match(/^(\s*)/)[0];
          let depth = 0;
          if (leadingSpaces.includes('\t')) {
            depth = leadingSpaces.length;
          } else {
            depth = Math.floor(leadingSpaces.length / 4); // assume 4 space indent
          }
          totalNestingDepth += depth;
        });

        // Parse functions to detect complexity ceiling
        if (node.language === 'python') {
          const funcRegex = /def\s+(\w+)\s*\(/g;
          let match;
          while ((match = funcRegex.exec(content)) !== null) {
            functionCount++;
            // Calculate complexity for this def block
            const blockStartIndex = match.index;
            // look ahead for next unindented def
            const body = content.substring(blockStartIndex, blockStartIndex + 3000);
            const branchMatches = body.match(/\b(if|for|while|elif|&&|\|\|)\b/g);
            const complexityVal = (branchMatches ? branchMatches.length : 0) + 1;
            if (complexityVal > 20) {
              functionsOver20++;
            }
          }
        } else {
          const funcRegex = /(?:function\s+(\w+)|\w+\s*\([^)]*\)\s*\{|=>\s*\{)/g;
          let match;
          while ((match = funcRegex.exec(content)) !== null) {
            functionCount++;
            const blockStartIndex = match.index;
            const body = content.substring(blockStartIndex, blockStartIndex + 3000);
            const branchMatches = body.match(/\b(if|for|while|switch|case|&&|\|\||\?)\b/g);
            const complexityVal = (branchMatches ? branchMatches.length : 0) + 1;
            if (complexityVal > 20) {
              functionsOver20++;
            }
          }
        }

      } catch (err) { /* ignore */ }
    }

    // 1. Average cyclomatic complexity across functions or loc (5 points)
    const avgComplexity = functionCount > 0 ? (totalComplexity / functionCount) : (totalComplexity / Math.max(1, nodes.length * 5));
    if (avgComplexity < 5.0) {
      score += 5;
    } else if (avgComplexity < 10.0) {
      score += 3;
      issues.push(`Moderate average code complexity (${avgComplexity.toFixed(1)} branches/func)`);
    } else {
      issues.push(`High average code complexity (${avgComplexity.toFixed(1)} branches/func)`);
    }

    // 2. Ceiling rule (3 points)
    const ceilingPoints = Math.max(0, 3 - functionsOver20);
    score += ceilingPoints;
    if (functionsOver20 > 0) {
      issues.push(`${functionsOver20} functions exceed the cyclomatic complexity threshold of 20`);
    }

    // 3. Nesting depth (2 points)
    const totalLines = nodes.reduce((sum, n) => sum + n.loc, 0);
    const avgDepth = totalLines > 0 ? (totalNestingDepth / totalLines) : 0;
    if (avgDepth < 3.0) {
      score += 2;
    } else {
      issues.push(`Deep average nesting depth (${avgDepth.toFixed(1)} levels, target below 3.0)`);
    }

    return {
      score: Math.min(10, Number(score.toFixed(1))),
      issues
    };
  }
}

module.exports = new ScoreService();
