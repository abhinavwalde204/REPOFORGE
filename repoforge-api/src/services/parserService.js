const path = require('path');
const fs = require('fs').promises;

/**
 * Service to parse codebases and build abstract file dependency maps.
 */
class ParserService {
  /**
   * Parse a cloned directory to produce a structured dependency graph.
   * @param {string} rootDir - Absolute path to the cloned repository root.
   * @returns {Promise<object>} - Nodes and edges mapping imports.
   */
  async parseDirectory(rootDir) {
    const nodes = [];
    const edges = [];
    const filesToProcess = [];

    // Helper: Recursively discover all code files
    const discoverFiles = async (currentDir) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        // Skip hidden folders (.git, .github) and common build dependencies (node_modules, venv, env)
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === 'venv' || 
            entry.name === 'env' || 
            entry.name === 'dist' || 
            entry.name === 'build') {
          continue;
        }

        if (entry.isDirectory()) {
          await discoverFiles(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.js', '.jsx', '.ts', '.tsx', '.py'].includes(ext)) {
            filesToProcess.push(fullPath);
          }
        }
      }
    };

    await discoverFiles(rootDir);

    // First pass: Build list of nodes (files)
    for (const filePath of filesToProcess) {
      const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
      const ext = path.extname(filePath).toLowerCase();
      let linesOfCode = 0;
      let sizeBytes = 0;

      try {
        const stats = await fs.stat(filePath);
        sizeBytes = stats.size;
        
        const content = await fs.readFile(filePath, 'utf-8');
        linesOfCode = content.split('\n').length;
      } catch (err) {
        // Fallback for file read errors
      }

      nodes.push({
        id: relativePath,
        name: path.basename(filePath),
        path: relativePath,
        size: sizeBytes,
        loc: linesOfCode,
        language: ext === '.py' ? 'python' : 'javascript',
        complexity: this.calculateRoughComplexity(linesOfCode)
      });
    }

    // Create a quick set of all known local file paths (nodes) for O(1) resolution checks
    const localFileSet = new Set(nodes.map(n => n.id));

    // Second pass: Read imports and resolve edges
    for (const filePath of filesToProcess) {
      const sourceRelative = path.relative(rootDir, filePath).replace(/\\/g, '/');
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const imports = path.extname(filePath).toLowerCase() === '.py' 
          ? this.extractPythonImports(content)
          : this.extractJavascriptImports(content);

        for (const imp of imports) {
          const resolvedPath = this.resolveImportPath(rootDir, path.dirname(filePath), imp, localFileSet);
          
          if (resolvedPath) {
            edges.push({
              id: `edge-${sourceRelative}->${resolvedPath}`,
              source: sourceRelative,
              target: resolvedPath,
              type: 'local'
            });
          }
        }
      } catch (err) {
        // Skip files that fail to parse
      }
    }

    return { nodes, edges };
  }

  /**
   * Rough estimate of logic complexity based on structural features.
   */
  calculateRoughComplexity(loc) {
    if (loc < 50) return 'low';
    if (loc < 250) return 'medium';
    return 'high';
  }

  /**
   * Extract ES6 and CommonJS imports using optimized regex matching.
   */
  extractJavascriptImports(content) {
    const imports = [];

    // Regex 1: import ... from 'source'
    const es6Regex = /import\s+[^;]{1,300}?\bfrom\s+['"]([^'"]+)['"]/g;
    // Regex 2: require('source')
    const commonJsRegex = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    // Regex 3: import('source')
    const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;
    while ((match = es6Regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    while ((match = commonJsRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return [...new Set(imports)];
  }

  /**
   * Extract Python import paths.
   */
  extractPythonImports(content) {
    const imports = [];
    const lines = content.split('\n');

    // Matches: "import sys, os", "import numpy as np"
    const importRegex = /^\s*import\s+([\w\s,\.]+)/;
    // Matches: "from datetime import datetime", "from .models import User"
    const fromImportRegex = /^\s*from\s+([\w\.]+)\s+import/;

    for (const line of lines) {
      let match = line.match(importRegex);
      if (match) {
        const modules = match[1].split(',').map(m => m.trim().split(/\s+as\s+/)[0]);
        imports.push(...modules);
        continue;
      }
      
      match = line.match(fromImportRegex);
      if (match) {
        imports.push(match[1].trim());
      }
    }

    return [...new Set(imports)];
  }

  /**
   * Resolve an import path (e.g. "./utils", "../components/Button") to a matching relative project file.
   */
  resolveImportPath(rootDir, currentDirAbs, importStr, localFileSet) {
    // If it doesn't look like a relative or local import, treat it as a package dependency (return null)
    if (!importStr.startsWith('.') && !importStr.startsWith('/')) {
      return null;
    }

    // Standardize file paths
    let targetAbs = path.resolve(currentDirAbs, importStr);
    let targetRelative = path.relative(rootDir, targetAbs).replace(/\\/g, '/');

    // Direct check if it already exists exactly (e.g. complete filename specified)
    if (localFileSet.has(targetRelative)) {
      return targetRelative;
    }

    // Try common file extensions in priority
    const commonExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py'];
    for (const ext of commonExtensions) {
      const checkPath = `${targetRelative}${ext}`;
      if (localFileSet.has(checkPath)) {
        return checkPath;
      }
    }

    // Try checking if it targets a directory containing an index file (e.g., "./components" -> "./components/index.js")
    for (const ext of commonExtensions) {
      const checkPath = `${targetRelative}/index${ext}`;
      if (localFileSet.has(checkPath)) {
        return checkPath;
      }
    }

    return null;
  }
}

module.exports = new ParserService();
