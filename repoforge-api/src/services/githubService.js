const { exec } = require('child_process');
const path = require('path');
const fsPromises = require('fs').promises;

/**
 * Service to handle cloning public GitHub repositories and extracting metadata.
 */
class GithubService {
  /**
   * Clone a public GitHub repository.
   * @param {string} repoUrl - Full URL to the GitHub repository.
   * @param {string} targetDir - Directory path where the repository should be cloned.
   * @returns {Promise<object>} - Metadata about the cloned repository.
   */
  async cloneRepository(repoUrl, targetDir) {
    // Validate repository URL structure
    const cleanedUrl = this.sanitizeUrl(repoUrl);
    
    // Ensure the parent temp folder exists
    await fsPromises.mkdir(path.dirname(targetDir), { recursive: true });
    
    // If target directory already exists (e.g. from previous aborted run), delete it first
    await this.deleteDirectory(targetDir);

    return new Promise((resolve, reject) => {
      // Execute superficial shallow clone (depth 1) for speed and performance
      const command = `git clone -q --depth 1 "${cleanedUrl}" "${targetDir}"`;
      
      exec(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, async (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(`Failed to clone repository: ${stderr || error.message}`));
        }

        try {
          const stats = await this.extractRepoStats(targetDir);
          resolve({
            success: true,
            clonePath: targetDir,
            ...stats
          });
        } catch (statsError) {
          // If stats collection fails, still resolve with basic success details
          resolve({
            success: true,
            clonePath: targetDir,
            totalFiles: 0,
            languages: {}
          });
        }
      });
    });
  }

  /**
   * Clean/sanitize user-entered GitHub URL to avoid script injection.
   */
  sanitizeUrl(url) {
    const trimmed = url.trim();
    // Match standard GitHub HTTP/HTTPS formats
    const match = trimmed.match(/^https?:\/\/(www\.)?github\.com\/([\w\-]+)\/([\w\-\.]+)/i);
    if (!match) {
      throw new Error('Invalid GitHub repository URL. Must be a public https://github.com/owner/repo link.');
    }
    
    const owner = match[2];
    let repo = match[3];
    if (repo.endsWith('.git')) {
      repo = repo.slice(0, -4);
    }
    return `https://github.com/${owner}/${repo}.git`;
  }

  /**
   * Scan folder to extract basic statistics.
   */
  async extractRepoStats(dirPath) {
    let totalFiles = 0;
    const languages = {};

    const scan = async (currentDir) => {
      const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip hidden folders (.git, etc.) and heavy build/dependency folders
        if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', 'venv', '__pycache__'].includes(entry.name)) continue;

        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          totalFiles++;
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) {
            languages[ext] = (languages[ext] || 0) + 1;
          }
        }
      }
    };

    await scan(dirPath);
    return { totalFiles, languages };
  }

  /**
   * Utility to delete directories recursively.
   */
  async deleteDirectory(dirPath) {
    try {
      await fsPromises.rm(dirPath, { recursive: true, force: true });
    } catch (e) {
      // Ignore if directory does not exist
    }
  }
}

module.exports = new GithubService();
