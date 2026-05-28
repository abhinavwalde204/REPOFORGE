import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Cpu, Play, Sparkles, Folder, FileCode, Check, 
  RotateCcw, History, FileText, ChevronRight, AlertTriangle, Loader2 
} from 'lucide-react';
import gsap from 'gsap';
import api from '../services/api';
import { cn } from '../utils/cn';

/**
 * High-performance regex-based custom tokenizer for code syntax highlighting.
 * Emulates the iconic VSCode Dark+ theme.
 */
const highlightCode = (code, filePath = '') => {
  if (!code) return '';
  
  // Escape HTML tags to prevent script injection and rendering glitches
  let escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Regex patterns
  const commentRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
  const stringRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g;
  const numberRegex = /\b(\d+(?:\.\d+)?)\b/g;

  // Language keywords (JS, TS, Python, Go, Rust, HTML, CSS)
  const keywords = [
    'const', 'let', 'var', 'function', 'class', 'return', 'import', 'require', 'export', 
    'default', 'if', 'else', 'for', 'while', 'async', 'await', 'try', 'catch', 'throw', 
    'new', 'typeof', 'in', 'of', 'def', 'from', 'as', 'self', 'and', 'or', 'not', 
    'elif', 'with', 'package', 'func', 'struct', 'interface', 'nil', 'pub', 'use', 'impl', 'fn'
  ];
  const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  
  // Standard built-ins and core keywords
  const builtins = [
    'console', 'process', 'module', 'exports', 'require', 'JSON', 'Math', 
    'Object', 'Array', 'String', 'Number', 'Boolean', 'window', 'document', 'self'
  ];
  const builtinRegex = new RegExp(`\\b(${builtins.join('|')})\\b`, 'g');
  
  // Literals (true, false, null, undefined)
  const literalRegex = /\b(true|false|null|undefined)\b/g;

  // Track code blocks that should not be syntax-highlighted inside strings/comments
  const placeholders = [];
  
  // 1. Temporarily replace comments and strings with unique markers
  escaped = escaped.replace(commentRegex, (match) => {
    const id = `__COMMENT_${placeholders.length}__`;
    placeholders.push({ id, html: `<span class="text-zinc-500 italic">${match}</span>` });
    return id;
  });
  
  escaped = escaped.replace(stringRegex, (match) => {
    const id = `__STRING_${placeholders.length}__`;
    placeholders.push({ id, html: `<span class="text-amber-300 font-medium">${match}</span>` });
    return id;
  });

  // 2. Apply token coloring to active code structures (numbers first to avoid corrupting injected classes like text-sky-400)
  escaped = escaped.replace(numberRegex, '<span class="text-orange-400 font-mono">$1</span>');
  escaped = escaped.replace(keywordRegex, '<span class="text-sky-400 font-semibold">$1</span>');
  escaped = escaped.replace(builtinRegex, '<span class="text-teal-400 font-medium">$1</span>');
  escaped = escaped.replace(literalRegex, '<span class="text-rose-400 font-semibold">$1</span>');

  // 3. Restore all protected strings and comments
  for (let i = placeholders.length - 1; i >= 0; i--) {
    escaped = escaped.replace(placeholders[i].id, placeholders[i].html);
  }

  return escaped;
};

const Editor = () => {
  const { id: analysisId } = useParams();
  const navigate = useNavigate();

  // Codebase State
  const [repoName, setRepoName] = useState('');
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [error, setError] = useState('');

  // Tab State
  const [activeLeftTab, setActiveLeftTab] = useState('files'); // 'files'

  // RAG / Suggestion State
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestedDiff, setSuggestedDiff] = useState('');
  const [suggestedPatchedContent, setSuggestedPatchedContent] = useState('');
  const [sessionId, setSessionId] = useState('');

  // Patches State (kept for apply functionality)
  const [patches, setPatches] = useState([]);
  const [isApplying, setIsApplying] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  // Animations Refs
  const containerRef = useRef(null);

  // 1. Fetch Repository Details, File List, and Patch History
  useEffect(() => {
    const fetchRepoData = async () => {
      try {
        const res = await api.get(`/analysis/graph/${analysisId}`);
        setRepoName(res.data.repoName);
        
        // Filter out folders, get unique file paths sorted alphabetically
        const fileNodes = res.data.nodes
          .filter(n => n.loc > 0)
          .map(n => n.id)
          .sort();
        setFiles(fileNodes);
        
        // Select first file by default if available
        if (fileNodes.length > 0) {
          setSelectedFile(fileNodes[0]);
        }
      } catch (err) {
        console.error('Error fetching repo layout:', err);
        setError('Failed to fetch codebase structure.');
      }
    };

    fetchRepoData();
    fetchPatchesList();

    // Fade-in animation
    if (containerRef.current) {
      gsap.fromTo(containerRef.current, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' });
    }
  }, [analysisId]);

  // 2. Fetch File Content when selection changes
  useEffect(() => {
    if (!selectedFile) return;

    const fetchContent = async () => {
      setIsLoadingFile(true);
      setSuggestedDiff('');
      setSuggestedPatchedContent('');
      try {
        const res = await api.post('/editor/suggest', {
          analysisId,
          filePath: selectedFile,
          prompt: 'Retrieve full file content'
        });
        setFileContent(res.data.originalContent || '');
      } catch (err) {
        console.error('Error fetching file content:', err);
        setFileContent('// Failed to read file content from workspace.');
      } finally {
        setIsLoadingFile(false);
      }
    };

    fetchContent();
  }, [selectedFile, analysisId]);

  const fetchPatchesList = async () => {
    try {
      const res = await api.get(`/editor/patches/${analysisId}`);
      setPatches(res.data);
    } catch (err) {
      console.error('Error fetching patches list:', err);
    }
  };

  // 3. Generate Patch Suggestion (RAG + LLM)
  const handleGenerateSuggestion = async (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || !selectedFile || isGenerating) return;

    setIsGenerating(true);
    setSuggestedDiff('');
    setSuggestedPatchedContent('');
    
    try {
      const res = await api.post('/editor/suggest', {
        analysisId,
        filePath: selectedFile,
        prompt: prompt
      });

      setSessionId(res.data.sessionId);
      setSuggestedDiff(res.data.diff);

      const parsedPatched = applyDiffMock(fileContent, res.data.diff);
      setSuggestedPatchedContent(parsedPatched);

    } catch (err) {
      console.error('Error generating suggestions:', err);
      alert('Failed to contact RAG patch generator.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to apply the diff lines for visual mockup rendering
  const applyDiffMock = (original, diffText) => {
    const lines = original.split('\n');
    const diffLines = diffText.split('\n');
    const additions = [];
    
    diffLines.forEach(l => {
      if (l.startsWith('+') && !l.startsWith('+++')) {
        additions.push(l.substring(1));
      }
    });

    if (additions.length > 0) {
      return [...additions, ...lines].join('\n');
    }
    return original;
  };

  // 4. Save & Apply Patch version
  const handleApplyPatch = async () => {
    if (!selectedFile || isApplying) return;

    setIsApplying(true);
    try {
      await api.post('/editor/apply', {
        analysisId,
        filePath: selectedFile,
        patchedContent: suggestedPatchedContent || fileContent,
        originalContent: fileContent,
        notes: `Applied patch suggestion: "${prompt}"`,
        sessionId
      });

      setFileContent(suggestedPatchedContent || fileContent);
      setSuggestedDiff('');
      setSuggestedPatchedContent('');
      setPrompt('');
      
      await fetchPatchesList();
      alert('Success! Code patch applied and saved.');
    } catch (err) {
      console.error('Error applying patch:', err);
      alert('Failed to save patch version.');
    } finally {
      setIsApplying(false);
    }
  };

  // 5. Revert Patch version
  const handleRevertPatch = async (patchId) => {
    if (isReverting) return;

    setIsReverting(true);
    try {
      await api.post('/editor/revert', { patchId });
      
      const current = selectedFile;
      setSelectedFile('');
      setTimeout(() => setSelectedFile(current), 100);
      
      await fetchPatchesList();
      alert('Patch successfully reverted.');
    } catch (err) {
      console.error('Error reverting patch:', err);
      alert('Failed to revert patch.');
    } finally {
      setIsReverting(false);
    }
  };

  // Custom visual diff renderer helper (renders full syntax highlighting per line)
  const renderVisualDiff = () => {
    if (!suggestedDiff) return null;
    
    const diffLines = suggestedDiff.split('\n');
    
    return (
      <div className="flex-1 overflow-auto flex flex-col font-mono text-xs p-5 bg-[#030303] text-zinc-300 custom-scroll border border-zinc-800/40 rounded-xl leading-relaxed">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-sans font-bold border-b border-zinc-850 pb-2.5 mb-4">
          Proposed Git Diff ({selectedFile})
        </span>
        <div className="space-y-[2px]">
          {diffLines.map((line, idx) => {
            const isAddition = line.startsWith('+') && !line.startsWith('+++');
            const isDeletion = line.startsWith('-') && !line.startsWith('---');
            const isMeta = line.startsWith('@@') || line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++');
            
            // Generate highlighted text
            let contentText = line;
            if (isAddition || isDeletion) {
              contentText = line.substring(1);
            }
            
            const highlightedHtml = isMeta ? contentText : highlightCode(contentText, selectedFile);
            
            return (
              <div 
                key={idx} 
                className={cn(
                  "px-3 py-1 rounded-lg flex items-start gap-4 transition-colors font-mono",
                  isAddition && "bg-emerald-950/20 text-emerald-300 border-l-2 border-emerald-500 shadow-[inset_0_0_8px_rgba(16,185,129,0.02)]",
                  isDeletion && "bg-rose-950/20 text-rose-300 border-l-2 border-rose-500 shadow-[inset_0_0_8px_rgba(244,63,94,0.02)]",
                  isMeta && "text-purple-400 font-bold opacity-80 bg-purple-950/5"
                )}
              >
                {/* Visual prefix indicator */}
                <span className="w-4 select-none opacity-40 font-bold shrink-0 text-center font-mono">
                  {isAddition ? '+' : isDeletion ? '-' : ' '}
                </span>
                
                <pre 
                  className="flex-1 whitespace-pre-wrap font-mono"
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render high-fidelity Code view with line numbers and Full Syntax Highlighting
  const renderSourceCode = () => {
    const lines = fileContent.split('\n');
    return (
      <div className="flex-1 overflow-auto flex bg-[#030303] border border-zinc-800/40 rounded-xl leading-relaxed custom-scroll relative">
        
        {/* Line Numbers Column */}
        <div className="select-none text-right px-4 py-5 bg-[#060606] text-zinc-650 font-mono text-xs border-r border-zinc-900 shrink-0 flex flex-col items-end gap-[4px] min-w-[3.5rem] sticky left-0 z-10">
          {lines.map((_, i) => (
            <span key={i} className="font-mono leading-relaxed">{i + 1}</span>
          ))}
        </div>

        {/* Syntax Highlighted Pre Column */}
        <div className="flex-1 py-5 px-6 font-mono text-xs text-zinc-100 flex flex-col gap-[4px] whitespace-pre">
          {lines.map((line, idx) => {
            const highlightedHtml = highlightCode(line, selectedFile);
            return (
              <pre
                key={idx}
                className="font-mono leading-relaxed"
                dangerouslySetInnerHTML={{ __html: highlightedHtml || '&nbsp;' }}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="h-screen max-h-screen flex flex-col p-5 max-w-[1700px] mx-auto w-full relative overflow-hidden">
      {/* Backdrop Gradients */}
      <div className="absolute top-1/4 left-10 w-[500px] h-[500px] rounded-full bg-rose-900/5 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-[500px] h-[500px] rounded-full bg-orange-900/5 blur-[150px] pointer-events-none" />

      {/* ── HEADER ── */}
      <header className="glass-panel w-full px-6 py-4 rounded-2xl flex items-center justify-between border border-zinc-800/60 mb-5 shrink-0 z-10">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(`/analysis/${analysisId}`)}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-6 w-[1px] bg-zinc-800" />
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-rose-400 text-glow" />
              Adaptive Code Editor
            </h1>
            <span className="text-xs text-zinc-500 font-mono truncate max-w-md">
              {repoName || 'Loading Repository...'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {suggestedDiff && (
            <button
              onClick={handleApplyPatch}
              disabled={isApplying}
              className="glow-btn bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer animate-pulse"
            >
              {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Apply Patch</span>
            </button>
          )}
        </div>
      </header>

      {/* ── EDITOR MAIN GRAPHICS ── */}
      <main className="flex-1 w-full grid grid-cols-1 lg:grid-cols-4 gap-5 lg:h-[calc(100vh-150px)] z-10 overflow-hidden">
        
        {/* 1. LEFT SIDEBAR (FILE TREE ONLY) */}
        <div className="lg:col-span-1 flex flex-col gap-4 lg:h-full lg:overflow-hidden">
          <div className="glass-panel p-5 rounded-2xl border border-zinc-800/50 flex-1 flex flex-col overflow-hidden">
            
            {/* Tabs Header – Files only */}
            <div className="flex bg-[#060606] p-1.5 rounded-xl border border-zinc-900 shrink-0 mb-4">
              <button
                onClick={() => setActiveLeftTab('files')}
                className={cn(
                  "flex-1 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition-all text-center cursor-pointer",
                  activeLeftTab === 'files'
                    ? "bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                    : "text-zinc-550 hover:text-zinc-350"
                )}
              >
                Codebase Files
              </button>
            </div>

            {/* Switchable Sidebar Content Container */}
            <div className="flex-1 overflow-y-auto custom-scroll pr-1">
              
              {/* Tab 1: Codebase Files */}
              {activeLeftTab === 'files' && (
                <div className="space-y-1.5">
                  {files.map((file) => (
                    <button
                      key={file}
                      onClick={() => setSelectedFile(file)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all border cursor-pointer truncate',
                        selectedFile === file
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.05)]'
                          : 'text-zinc-400 border-transparent hover:bg-zinc-900/50 hover:text-zinc-200'
                      )}
                    >
                      <FileCode className={cn("w-4 h-4 shrink-0", selectedFile === file ? "text-rose-400" : "text-zinc-500")} />
                      <span className="truncate">{file}</span>
                    </button>
                  ))}
                </div>
              )}



            </div>
          </div>
        </div>

        {/* 2. CENTER STAGE: DIFF VIEWER / SOURCE CODE */}
        <div className="lg:col-span-2 glass-panel rounded-2xl border border-zinc-800/50 overflow-hidden flex flex-col relative p-5 gap-4 lg:h-full">
          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <AlertTriangle className="w-12 h-12 text-rose-500 mb-4" />
              <h3 className="text-zinc-100 font-bold mb-2">Workspace Error</h3>
              <p className="text-zinc-400 text-sm max-w-sm">{error}</p>
            </div>
          ) : isLoadingFile ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
              <span className="text-xs font-bold uppercase tracking-wider">Syncing file contents...</span>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden h-full">
              {/* File Title */}
              <div className="flex justify-between items-center bg-[#090909] px-4 py-3 rounded-xl border border-zinc-800/40 shrink-0">
                <span className="text-xs font-mono font-bold text-zinc-200 truncate">
                  {selectedFile || 'No file selected'}
                </span>
                <span className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                  {selectedFile.split('.').pop() || 'txt'}
                </span>
              </div>

              {/* High-Fidelity Code / Diff Viewer (Occupies the entire center space!) */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {suggestedDiff ? renderVisualDiff() : renderSourceCode()}
              </div>
            </div>
          )}
        </div>

        {/* 3. RIGHT SIDEBAR (RAG CONSOLE & ANTIGRAVITY AI PROMPT DECK) */}
        <div className="lg:col-span-1 flex flex-col gap-4 lg:h-full lg:overflow-hidden">
          <div className="glass-panel p-5 rounded-2xl border border-zinc-800/50 flex-1 flex flex-col overflow-hidden gap-4">
            
            {/* Top Assistant Status Area */}
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
              <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-900/60 flex flex-col gap-3">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  RAG Assistant Active
                </h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
                  RepoForge is evaluation codebase contexts. Type below to generate patches or validations instantly.
                </p>
              </div>

              {suggestedDiff && (
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-805 flex flex-col gap-4 relative overflow-hidden animate-fade-in">
                  <div className="absolute top-0 left-0 w-[2px] h-full bg-emerald-500" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200">Patch Proposed</span>
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-950/20 text-emerald-400 border border-emerald-900/30">Ready</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Review highlighted green additions and red deletions in the main code viewer.
                  </p>
                  <button
                    onClick={handleApplyPatch}
                    disabled={isApplying}
                    className="w-full justify-center bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs uppercase tracking-wider py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.15)] hover:scale-[1.01]"
                  >
                    {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>Apply and Save</span>
                  </button>
                </div>
              )}
            </div>

            {/* Antigravity-style Sleek AI Prompt Box */}
            <form onSubmit={handleGenerateSuggestion} className="w-full flex flex-col bg-[#050505] p-4 rounded-2xl border border-zinc-800/80 gap-3 relative shrink-0">
              {/* Sparkle Icon */}
              <div className="flex items-center text-zinc-500">
                <Sparkles className="w-4 h-4 text-rose-400 text-glow" />
              </div>
              
              {/* Input Textarea */}
              <textarea
                rows={4}
                placeholder="Ask me anything......"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
                className="w-full bg-transparent text-xs font-semibold text-zinc-200 outline-none placeholder-zinc-650 resize-none leading-relaxed custom-scroll"
                required
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerateSuggestion();
                  }
                }}
              />

              {/* Bottom Attachment Context & Submit Circle Button */}
              <div className="flex items-center justify-between border-t border-zinc-900 pt-3 mt-1">
                {/* context anchor pill */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/60 border border-zinc-800/60 text-[10px] text-zinc-400 font-mono font-medium max-w-[185px] truncate">
                  <span className="opacity-60">📎</span>
                  <span className="truncate">{selectedFile.split('/').pop() || 'No file selected'}</span>
                </div>

                {/* Circular Submit Button inside Coral Red Gradient */}
                <button
                  type="submit"
                  disabled={isGenerating || !selectedFile}
                  className="w-8 h-8 rounded-full bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white flex items-center justify-center transition-all duration-300 shadow-[0_0_12px_rgba(244,63,94,0.15)] hover:shadow-[0_0_18px_rgba(244,63,94,0.25)] cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <span className="text-sm font-extrabold font-sans">↑</span>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>

      </main>
    </div>
  );
};

export default Editor;
