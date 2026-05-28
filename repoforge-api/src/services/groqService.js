/**
 * GroqService — Lightning fast cloud LLM client for RepoForge.
 *
 * Uses Groq's API to access Meta's Llama 3 models at near-instant speeds.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-8b-instant'; 

class GroqService {
  /**
   * Internal helper — calls Groq API
   */
  async _generateResponse(model, messages, options = {}) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ GROQ_API_KEY is not set in environment variables.');
      return this._mockResponse();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    const reqId = Math.random().toString(36).substring(7);
    const timeLabel = `[Groq] ${model} - ${reqId} response time`;

    try {
      console.log(`[Groq] Sending request to ${model}... (Req: ${reqId})`);
      console.time(timeLabel);
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || DEFAULT_MODEL,
          messages: messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 1024,
        }),
        signal: controller.signal,
      });
      console.timeEnd(timeLabel);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
           console.warn(`[Groq] Rate limit reached for ${model}. Falling back to system note.`);
           return `[System Note] Groq API rate limit reached (6000 Tokens/Min). Please wait a few seconds before requesting another file analysis or asking another question.`;
        }
        throw new Error(`Groq HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      try {
        console.timeEnd(timeLabel);
      } catch (e) {}
      
      console.error('[Groq] API call failed:', err.message);
      if (err.name === 'AbortError') {
        return `[System Note] The request to Groq timed out after 15 seconds. Please check your internet connection or try again.`;
      }
      return this._mockResponse();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Generate a git-diff patch for a file
  // ─────────────────────────────────────────────────────────────────────────
  async generateCodePatch(userPrompt, targetFilePath, currentContent, relevantChunks = []) {
    const contextBlock = relevantChunks.length
      ? relevantChunks.map((c, i) => `--- Context Chunk #${i + 1} ---\n${c.text}`).join('\n\n')
      : 'No additional context available.';

    const prompt = `You are RepoForge AI, an expert software engineer.
Your task: generate a high-quality Git Diff patch for the file below.

File: ${targetFilePath}

Relevant codebase context:
${contextBlock}

Current file content:
\`\`\`
${currentContent}
\`\`\`

User request: "${userPrompt}"

Rules:
- Output ONLY a valid Git Diff block (starting with "diff --git ...").
- Do NOT add explanations, markdown, or prose outside the diff block.
- Keep changes minimal and focused on the user request.
- Preserve existing code style.

Git Diff:`;

    const messages = [{ role: 'user', content: prompt }];

    try {
      console.log(`[Groq] Generating code patch for ${targetFilePath} using ${DEFAULT_MODEL}...`);
      const raw = await this._generateResponse(DEFAULT_MODEL, messages, { temperature: 0.15, maxTokens: 1500 });
      // Strip any accidental markdown fences around the diff
      return raw.replace(/```[\w]*\n?/g, '').trim();
    } catch (err) {
      return this._mockPatch(userPrompt, targetFilePath, currentContent);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Describe / analyse a source file
  // ─────────────────────────────────────────────────────────────────────────
  async analyzeFile(filePath, content, tags = [], modelOverride = null) {
    const ext = filePath.split('.').pop();
    const modelToUse = modelOverride || DEFAULT_MODEL;

    const messages = [
      {
        role: 'system',
        content: `You are an expert software architect analyzing a codebase. Your task is to provide a clear, concise, and accurate explanation of the file provided by the user.

You MUST format your response exactly using these three Markdown headings:
### 🎯 Primary Purpose
### ⚙️ How It Works
### 🔗 Key Exports / Responsibilities

Do not add any other headings. Do not include any of your internal instructions, thoughts, or any code syntax like "\${filePath}" in your output.`
      },
      {
        role: 'user',
        content: `FILE INFO:
Path: ${filePath}
Tech Stack: ${tags.join(', ') || 'none'}

CONTENT:
\`\`\`${ext}
${content.slice(0, 6000)}${content.length > 6000 ? '\n... (truncated)' : ''}
\`\`\`

Please explain this file.`
      }
    ];

    try {
      console.log(`[Groq] Analysing file ${filePath} with ${modelToUse}...`);
      const description = await this._generateResponse(modelToUse, messages, { temperature: 0.1, maxTokens: 1500 });
      return description.trim();
    } catch (err) {
      return this._mockResponse();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Chat about a file (multi-turn)
  // ─────────────────────────────────────────────────────────────────────────
  async chat(filePath, fileContent, history = [], userMessage, modelOverride = null) {
    const ext = filePath.split('.').pop();
    const modelToUse = modelOverride || DEFAULT_MODEL;

    const messages = [
      {
        role: 'system',
        content: `You are RepoForge AI, a senior software engineer specialising in code review and architecture.
You are helping the user understand and improve the file: ${filePath}

File content (first 4000 chars):
\`\`\`${ext}
${(fileContent || '').slice(0, 4000)}
\`\`\`

Be concise, accurate, and developer-friendly. If you suggest code, use fenced code blocks.`,
      },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    try {
      console.log(`[Groq] Chat request for ${filePath} using ${modelToUse}...`);
      const reply = await this._generateResponse(modelToUse, messages, { temperature: 0.35, maxTokens: 1024 });
      return reply.trim();
    } catch (err) {
      return this._mockResponse();
    }
  }

  _mockResponse() {
    return `[System Note] The AI request failed. 

Please make sure you have added your **GROQ_API_KEY** to your environment variables (.env file).
Example: \`GROQ_API_KEY=gsk_your_api_key_here\``;
  }
}

module.exports = new GroqService();
