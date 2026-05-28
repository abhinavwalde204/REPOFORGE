# Code Analyzer Completion Plan

## Goal Description
Replace the Adaptive Code Editor with the new Code Analyzer component, remove the old Applied Patches UI, and implement the necessary backend endpoints to support RAG analysis, chat, and repository zip download.

## User Review Required
[!IMPORTANT]
- Ensure the removal of the Applied Patches UI does not break any existing workflows that might still rely on the Editor page.
- The new RAG endpoints are stubbed; they need a real LLM integration later.
- The ZIP download endpoint streams the entire repository; confirm it respects the original repo structure and does not modify any files.

## Open Questions
- Do you want a dedicated route like `/analysis/:id/code/:filePath` or a query param `?file=...` for the Code Analyzer page?
- Should the RAG analysis endpoint return a brief description only, or also include token usage stats?
- Any size limit for the repository ZIP download?

## Proposed Changes
---
### Frontend
#### [NEW] [src/pages/CodeAnalyzerPage.jsx](file:///c:/Users/KIIT0001/OneDrive/Desktop/RepoForge/repoforge-frontend/src/pages/CodeAnalyzerPage.jsx)
```tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CodeAnalyzer from '../components/CodeAnalyzer';
import api from '../services/api';
import { Loader2 } from 'lucide-react';

const CodeAnalyzerPage = () => {
  const { id, '*': rest } = useParams(); // rest captures the file path after a wildcard
  const filePath = decodeURIComponent(rest || '');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!filePath) {
      // no file specified – go back to analysis overview
      navigate(`/analysis/${id}`);
      return;
    }
    const fetchFile = async () => {
      try {
        const res = await api.get(`/analysis/${id}/file`, { params: { path: filePath } });
        setContent(res.data.content);
      } catch (e) {
        console.error(e);
        alert('Unable to load file.');
      } finally {
        setLoading(false);
      }
    };
    fetchFile();
  }, [id, filePath, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return <CodeAnalyzer filePath={filePath} fileContent={content} />;
};

export default CodeAnalyzerPage;
```

#### [MODIFY] [src/App.jsx](file:///c:/Users/KIIT0001/OneDrive/Desktop/RepoForge/repoforge-frontend/src/App.jsx)
```diff
@@
-        <Route
-          path="/analysis/:id/editor"
-          element={
-            <ProtectedRoute>
-              <CodeAnalyzerPage />
-            </ProtectedRoute>
-          }
-        />
+        <Route
+          path="/analysis/:id/code/*"
+          element={
+            <ProtectedRoute>
+              <CodeAnalyzerPage />
+            </ProtectedRoute>
+          }
+        />
``` 

#### [MODIFY] [src/pages/Editor.jsx](file:///c:/Users/KIIT0001/OneDrive/Desktop/RepoForge/repoforge-frontend/src/pages/Editor.jsx)
```diff
@@
-        {/* 1. LEFT SIDEBAR (FILE TREE & APPLIED PATCHES TABS) */}
-        <div className="lg:col-span-1 flex flex-col gap-4 lg:h-full lg:overflow-hidden">
-          <div className="glass-panel p-5 rounded-2xl border border-zinc-800/50 flex-1 flex flex-col overflow-hidden">
-            {/* High-Fidelity Tabs Header */}
-            <div className="flex bg-[#060606] p-1.5 rounded-xl border border-zinc-900 shrink-0 mb-4">
-              <button
-                onClick={() => setActiveLeftTab('files')}
-                className={cn(
-                  "flex-1 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition-all text-center cursor-pointer",
-                  activeLeftTab === 'files'
-                    ? "bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
-                    : "text-zinc-550 hover:text-zinc-350"
-                )}
-              >
-                Codebase Files
-              </button>
-              <button
-                onClick={() => setActiveLeftTab('patches')}
-                className={cn(
-                  "flex-1 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition-all text-center cursor-pointer",
-                  activeLeftTab === 'patches'
-                    ? "bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
-                    : "text-zinc-550 hover:text-zinc-350"
-                )}
-              >
-                Applied Patches
-              </button>
-            </div>
-            ...
-          </div>
-        </div>
+        {/* 1. LEFT SIDEBAR (FILE TREE ONLY) */}
+        <div className="lg:col-span-1 flex flex-col gap-4 lg:h-full lg:overflow-hidden">
+          <div className="glass-panel p-5 rounded-2xl border border-zinc-800/50 flex-1 flex flex-col overflow-hidden">
+            {/* Tabs Header – Files only */}
+            <div className="flex bg-[#060606] p-1.5 rounded-xl border border-zinc-900 shrink-0 mb-4">
+              <button
+                onClick={() => setActiveLeftTab('files')}
+                className={cn(
+                  "flex-1 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition-all text-center cursor-pointer",
+                  activeLeftTab === 'files'
+                    ? "bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
+                    : "text-zinc-550 hover:text-zinc-350"
+                )}
+              >
+                Codebase Files
+              </button>
+            </div>
+            ... (rest of file unchanged)
+          </div>
+        </div>
``` 

---
### Backend
#### [NEW] [src/routes/rag.js](file:///c:/Users/KIIT0001/OneDrive/Desktop/RepoForge/repoforge-api/src/routes/rag.js)
```js
const express = require('express');
const router = express.Router();

// Stubbed RAG analysis – replace with real LLM call later
router.post('/analyze', async (req, res) => {
  const { filePath, content, tags } = req.body;
  // Simple placeholder description
  const description = `This ${tags.join(', ') || 'file'} appears to be a ${filePath.split('.').pop()} source file. It contains ${content.split('\n').length} lines of code.`;
  res.json({ description });
});

router.post('/chat', async (req, res) => {
  const { filePath, history } = req.body;
  // Echo back the last user message as a placeholder
  const last = history[history.length - 1];
  const reply = `I see you asked about "${last.text}". (This is a stub response.)`;
  res.json({ reply });
});

// Zip download – streams the whole repository folder safely
router.get('/download', async (req, res) => {
  const archiver = require('archiver');
  const path = require('path');
  const repoRoot = path.resolve(__dirname, '../../../'); // project root
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="repo.zip"');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => { console.error(err); res.status(500).end(); });
  archive.pipe(res);
  archive.directory(repoRoot, false);
  archive.finalize();
});

module.exports = router;
```

#### [MODIFY] [src/index.js](file:///c:/Users/KIIT0001/OneDrive/Desktop/RepoForge/repoforge-api/index.js)
```diff
@@
-const analysisRoutes = require('./src/routes/analysis');
+const analysisRoutes = require('./src/routes/analysis');
+const ragRoutes = require('./src/routes/rag');
@@
-  app.use('/api/analysis', analysisRoutes);
+  app.use('/api/analysis', analysisRoutes);
+  app.use('/api/rag', ragRoutes);
``` 

## Verification Plan
- **Frontend**: Navigate to `/analysis/:id/code/<path>` (e.g., `/analysis/123/code/src/components/RepoScoreCard.jsx`). Verify the file loads, tech badges appear, description is shown, chat works, and the ZIP download triggers a file download.
- **Backend**: Call each new endpoint with `curl` or Postman to ensure JSON responses and a valid ZIP stream.
- **Removed UI**: Ensure the “Applied Patches” tab no longer renders and the layout remains stable.
- **Automated tests**: Add simple Jest tests for the rag routes (status 200, correct JSON shape) and an integration test that the download endpoint returns a `Content-Type: application/zip`.

---
