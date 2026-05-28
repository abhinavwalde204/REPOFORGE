import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ArrowLeft, FileCode, Download, Send, Sparkles, MessageCircle, X, ArrowUp, Cpu, ChevronDown, Check } from 'lucide-react';
import api from '../services/api';
import gsap from 'gsap';

const renderMarkdown = (text) => {
  if (!text) return null;
  const parts = text.split('\n');
  return parts.map((line, i) => {
    let formattedLine = line;
    let isHeading = false;
    
    if (formattedLine.startsWith('### ')) {
      isHeading = true;
      formattedLine = formattedLine.replace('### ', '');
    }

    const boldRegex = /\*\*(.*?)\*\*/g;
    const withBold = [];
    let lastIdx = 0;
    let match;
    while ((match = boldRegex.exec(formattedLine)) !== null) {
      withBold.push(formattedLine.substring(lastIdx, match.index));
      withBold.push(<strong key={`b-${i}-${match.index}`} className="text-rose-400 font-bold">{match[1]}</strong>);
      lastIdx = match.index + match[0].length;
    }
    withBold.push(formattedLine.substring(lastIdx));

    if (isHeading) {
      return (
        <h3 key={i} className="text-sm font-extrabold text-zinc-100 mt-5 mb-2 uppercase tracking-wide border-b border-zinc-800 pb-1">
          {withBold.length ? withBold : formattedLine}
        </h3>
      );
    }
    
    if (formattedLine.trim() === '') {
      return <div key={i} className="h-2"></div>;
    }

    return (
      <p key={i} className="mb-2 last:mb-0 text-zinc-300 leading-relaxed">
        {withBold.length ? withBold : formattedLine}
      </p>
    );
  });
};

const ChatBubble = ({ role, content, isDescription }) => (
  <div className={`flex flex-col w-full py-4 px-3 mb-2 rounded-xl transition-all ${
    role === 'assistant' 
      ? 'bg-transparent border border-zinc-800/40' 
      : 'bg-gradient-to-br from-rose-400 to-orange-400 text-black shadow-md'
  }`}>
    {((role === 'assistant' && isDescription) || role === 'user') && (
      <div className={`flex items-center gap-2 mb-3 border-b pb-2 ${role === 'assistant' ? 'border-zinc-800/40' : 'border-black/10'}`}>
        <div className={`w-2 h-2 rounded-full ${role === 'assistant' ? 'bg-rose-500' : 'bg-black'}`} />
        <span className={`text-[11px] font-extrabold uppercase tracking-wider ${role === 'assistant' ? 'text-rose-400' : 'text-black'}`}>
          {role === 'assistant' ? 'Description' : 'You'}
        </span>
      </div>
    )}
    <div className={`text-[13px] w-full overflow-hidden ${role === 'assistant' ? 'text-zinc-200' : 'text-black font-medium leading-relaxed'}`}>
      {role === 'assistant' ? renderMarkdown(content) : content}
    </div>
  </div>
);

/**
 * CodeAnalyzer – displays a source file with syntax highlighting, tech badges,
 * RAG-generated description, an interactive chat, file sidebar, and repository download.
 */
const CodeAnalyzer = ({ analysisId, filePath, fileContent, files = [], onFileSelect }) => {
  const navigate = useNavigate();
  const [techTags, setTechTags] = useState([]);
  const [fileChats, setFileChats] = useState({});
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(true); // Open chat by default to show description
  const [sessionIds, setSessionIds] = useState({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [chatWidth, setChatWidth] = useState(400); // Resizable panel width
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.1-8b-instant');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const containerRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Drag handlers for chat panel
  const handleMouseDown = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const newWidth = document.body.clientWidth - e.clientX - 20; // 20px padding
    if (newWidth > 300 && newWidth < 800) {
      setChatWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
  };

  // Derived state for current file's chat log
  const chatLog = fileChats[filePath] || [];
  const sessionId = sessionIds[filePath] || null;

  // Detect tech tags based on extension & simple content heuristics
  const detectTech = (content, path) => {
    const tags = [];
    const ext = path.split('.').pop().toLowerCase();
    if (ext === 'py') tags.push('Python');
    if (ext === 'js' || ext === 'jsx') tags.push('JavaScript');
    if (ext === 'ts' || ext === 'tsx') tags.push('TypeScript');
    if (ext === 'css') tags.push('CSS');
    if (ext === 'html') tags.push('HTML');
    if (ext === 'json') tags.push('JSON');
    if (ext === 'md') tags.push('Markdown');
    if (/import\s+React|from\s+['"]react/.test(content)) tags.push('React');
    if (/@tailwind/.test(content)) tags.push('TailwindCSS');
    if (/express/.test(content)) tags.push('Express');
    if (/mongoose|mongodb/.test(content)) tags.push('MongoDB');
    return [...new Set(tags)];
  };

  // Map file extension to Prism language identifier
  const getLanguage = (path) => {
    const ext = path.split('.').pop().toLowerCase();
    const map = {
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
      py: 'python', css: 'css', html: 'html', json: 'json',
      md: 'markdown', yml: 'yaml', yaml: 'yaml', sh: 'bash',
      go: 'go', rs: 'rust', java: 'java', rb: 'ruby',
    };
    return map[ext] || 'text';
  };

  // Fetch RAG description when file changes and isn't cached
  useEffect(() => {
    if (!fileContent || !filePath) return;
    const tags = detectTech(fileContent, filePath);
    setTechTags(tags);

    // If we already have a chat history for this file, do not refetch
    if (fileChats[filePath]) return;

    // Set initial loading state in chat
    setFileChats(prev => ({
      ...prev,
      [filePath]: [{ role: 'assistant', content: 'Generating description...', isDescription: true }]
    }));

    const fetchDescription = async () => {
      try {
        const res = await api.post('/rag/analyze', { filePath, content: fileContent, tags, model: selectedModel });
        const desc = res.data.description || 'No description available.';
        
        setFileChats(prev => ({
          ...prev,
          [filePath]: [{ role: 'assistant', content: desc, isDescription: true }]
        }));
      } catch (e) {
        console.error(e);
        setFileChats(prev => ({
          ...prev,
          [filePath]: [{ role: 'assistant', content: 'Failed to generate description.', isDescription: true }]
        }));
      }
    };
    fetchDescription();
  }, [filePath, fileContent]);



  // Animate container on mount
  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' });
    }
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    
    setFileChats(prev => ({
      ...prev,
      [filePath]: [...(prev[filePath] || []), { role: 'user', content: userMsg }]
    }));
    setChatInput('');
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
    }
    setIsChatLoading(true);
    try {
      const res = await api.post('/rag/chat', {
        sessionId,
        message: userMsg,
        filePath,
        fileContent,
        model: selectedModel
      });
      if (res.data.sessionId && !sessionId) {
        setSessionIds(prev => ({ ...prev, [filePath]: res.data.sessionId }));
      }
      setFileChats(prev => ({
        ...prev,
        [filePath]: [...(prev[filePath] || []), { role: 'assistant', content: res.data.reply }]
      }));
    } catch (e) {
      console.error(e);
      setFileChats(prev => ({
        ...prev,
        [filePath]: [...(prev[filePath] || []), { role: 'assistant', content: 'Error obtaining response.' }]
      }));
    } finally {
      setIsChatLoading(false);
    }
  };

  const downloadRepo = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await api.get(`/rag/repo/download/${analysisId}`, { responseType: 'blob', validateStatus: () => true });
      if (res.status !== 200) {
        // Try to parse error message from Blob if present
        let errMsg = `Failed to download repository (status ${res.status})`;
        try {
          const text = await res.data.text();
          const parsed = JSON.parse(text);
          if (parsed.error) errMsg += `: ${parsed.error}`;
        } catch (e) {
          // ignore parsing errors
        }
        alert(errMsg);
        return;
      }
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `repo-${analysisId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to download repository.');
    } finally {
      setIsDownloading(false);
    }
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
              <Sparkles className="w-5 h-5 text-rose-400 text-glow" />
              Code Analyzer
            </h1>
            <span className="text-xs text-zinc-500 font-mono truncate max-w-md">
              {filePath || 'Select a file'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Chat toggle */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              isChatOpen
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
          </button>


        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 w-full flex gap-5 lg:h-[calc(100vh-130px)] z-10 overflow-hidden">

        {/* 1. LEFT SIDEBAR — File Tree */}
        <div className="w-[20%] min-w-[200px] flex flex-col gap-4 lg:h-full lg:overflow-hidden shrink-0 hidden lg:flex">
          <div className="glass-panel p-5 rounded-2xl border border-zinc-800/50 flex-1 flex flex-col overflow-hidden">
            <div className="flex bg-[#060606] p-1.5 rounded-xl border border-zinc-900 shrink-0 mb-4">
              <div className="flex-1 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-lg text-center bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                Codebase Files
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll pr-1">
              <div className="space-y-1.5">
                {files.map((file) => (
                  <button
                    key={file}
                    onClick={() => onFileSelect?.(file)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all border cursor-pointer truncate ${
                      filePath === file
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.05)]'
                        : 'text-zinc-400 border-transparent hover:bg-zinc-900/50 hover:text-zinc-200'
                    }`}
                  >
                    <FileCode className={`w-4 h-4 shrink-0 ${filePath === file ? 'text-rose-400' : 'text-zinc-500'}`} />
                    <span className="truncate">{file}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 2. CENTER — Code Viewer + Description */}
        <div className="flex-1 min-w-[300px] glass-panel rounded-2xl border border-zinc-800/50 overflow-hidden flex flex-col relative p-5 gap-4 lg:h-full transition-all">
          
          {/* File Title Bar */}
          <div className="flex justify-between items-center bg-[#090909] px-4 py-3 rounded-xl border border-zinc-800/40 shrink-0">
            <span className="text-xs font-mono font-bold text-zinc-200 truncate">
              {filePath || 'No file selected'}
            </span>
            <div className="flex items-center gap-2">
              {/* Tech badges */}
              {techTags.map(tag => (
                <span key={tag} className="bg-rose-500/10 text-rose-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-rose-500/20">
                  {tag}
                </span>
              ))}
              <span className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                {filePath.split('.').pop() || 'txt'}
              </span>
            </div>
          </div>

          {/* Syntax Highlighted Code */}
          <div className="flex-1 overflow-auto min-h-0 border border-zinc-800/40 rounded-xl bg-[#030303]">
            <SyntaxHighlighter
              language={getLanguage(filePath)}
              style={atomDark}
              showLineNumbers
              lineNumberStyle={{ color: '#3f3f46', fontSize: '11px', paddingRight: '16px', minWidth: '3em' }}
              customStyle={{
                background: 'transparent',
                margin: 0,
                padding: '20px',
                fontSize: '13px',
                lineHeight: '1.7',
              }}
              wrapLongLines
            >
              {fileContent || '// No content'}
            </SyntaxHighlighter>
          </div>


        </div>

        {/* DRAG HANDLE */}
        {isChatOpen && (
          <div 
            className="w-1.5 cursor-col-resize hover:bg-rose-500/50 active:bg-rose-500 transition-colors rounded-full shrink-0" 
            onMouseDown={handleMouseDown} 
          />
        )}

        {/* 3. RIGHT SIDEBAR — Chat Panel (conditionally shown) */}
        {isChatOpen && (
          <div style={{ width: `${chatWidth}px` }} className="flex flex-col gap-4 lg:h-full lg:overflow-hidden shrink-0">
            <div className="glass-panel p-4 rounded-2xl border border-zinc-800/50 flex-1 flex flex-col overflow-hidden gap-3">
              
              {/* Chat Header */}
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-300">Chat Assistant</span>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto custom-scroll flex flex-col gap-1 min-h-0">
                {chatLog.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-2">
                    <MessageCircle className="w-8 h-8 text-zinc-700" />
                    <span className="text-[11px] text-zinc-600 font-medium">Ask questions about this file</span>
                  </div>
                )}
                {chatLog.map((msg, i) => (
                  <ChatBubble key={i} role={msg.role} content={msg.content} isDescription={msg.isDescription} />
                ))}
                {isChatLoading && (
                  <div className="flex items-center gap-2 px-3 py-4 mt-2 mb-2">
                    <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="flex flex-col shrink-0 bg-black border border-zinc-700/50 rounded-2xl mt-1 shadow-lg relative">
                <textarea
                  ref={chatInputRef}
                  rows={1}
                  className="w-full px-4 pt-4 pb-3 bg-transparent text-zinc-100 text-sm focus:outline-none placeholder-zinc-500 resize-none max-h-32 custom-scroll rounded-t-2xl"
                  placeholder="Ask me anything......."
                  value={chatInput}
                  onChange={e => {
                    setChatInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={isChatLoading}
                />
                <div className="h-[1px] w-[calc(100%-2rem)] mx-auto bg-zinc-700/50 my-1"></div>
                <div className="flex items-center justify-between px-3 py-2 rounded-b-2xl bg-black">
                  <div className="relative">
                    <button 
                      onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                      className="flex items-center gap-2 bg-zinc-900/50 text-zinc-300 text-[11px] font-semibold px-3 py-1.5 rounded-xl border border-zinc-700/50 hover:bg-zinc-800 hover:border-rose-500/30 transition-all focus:outline-none cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                      {selectedModel}
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isModelDropdownOpen && (
                      <div className="absolute bottom-full left-0 mb-2 w-48 bg-[#0f1115] border border-zinc-700/50 rounded-xl shadow-xl overflow-hidden z-50 py-1">
                        {['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'].map(model => (
                          <button
                            key={model}
                            onClick={() => {
                              setSelectedModel(model);
                              setIsModelDropdownOpen(false);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium hover:bg-white/5 transition-colors text-left cursor-pointer"
                          >
                            <span className={selectedModel === model ? 'text-rose-400' : 'text-zinc-300'}>{model}</span>
                            {selectedModel === model && <Check className="w-3.5 h-3.5 text-rose-400" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={sendMessage}
                    disabled={isChatLoading || !chatInput.trim()}
                    className="p-2 bg-gradient-to-r from-rose-500 to-orange-500 text-white rounded-xl hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <ArrowUp className="w-4 h-4 font-bold" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CodeAnalyzer;
