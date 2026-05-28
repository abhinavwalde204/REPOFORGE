import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, LogOut, GitBranch, ArrowRight, GitFork, 
  Binary, Cpu, ShieldAlert, History, Activity, FolderOpen, Loader2,
  User, ChevronDown, ChevronRight, UserCircle, X,
  Copy, Check
} from 'lucide-react';
import gsap from 'gsap';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import { cn } from '../utils/cn';

const Dashboard = () => {
  const { user, logout, history, initiatePasswordReset, resetPassword, addToHistory } = useAuthStore();
  const navigate = useNavigate();
  
  const [repoUrl, setRepoUrl] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);

  // Modals & Dropdowns state
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  
  // Password reset state
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  // Share link state
  const [currentAnalysisId, setCurrentAnalysisId] = useState(null);
  const [isCopied, setIsCopied] = useState(false);

  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const mainCardRef = useRef(null);
  const featureGridRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsProfileOpen(false);
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (containerRef.current) {
        gsap.fromTo(containerRef.current, 
          { opacity: 0 }, 
          { opacity: 1, duration: 0.8, ease: 'power3.out' }
        );
      }
    });
    return () => ctx.revert();
  }, []);

  const handleLogout = () => {
    gsap.to(containerRef.current, {
      opacity: 0,
      scale: 0.98,
      duration: 0.5,
      ease: 'power3.in',
      onComplete: async () => {
        await logout();
        navigate('/login');
      }
    });
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!repoUrl) return;

    setIsIngesting(true);
    
    try {
      const res = await api.post('/analysis/trigger', { githubUrl: repoUrl });
      
      if (res.data && res.data.analysisId) {
         addToHistory(repoUrl, res.data.analysisId);
         setCurrentAnalysisId(res.data.analysisId);
         navigate(`/analysis/${res.data.analysisId}`);
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || err.response?.data?.message || 'Failed to trigger ingestion.');
      setIsIngesting(false);
    }
  };

  const handleCreateShare = async () => {
    if (!currentAnalysisId) {
      alert('Please forge a repository map first before sharing.');
      return;
    }
    try {
      const res = await api.post('/share/trigger', { analysisId: currentAnalysisId });
      const url = res.data.shareUrl || '';
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error('Error generating share link:', err);
      alert('Failed to generate share link. Please try again.');
    }
  };

  const handleLocalFolderSelect = async () => {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support the File System Access API. Please use Google Chrome, Microsoft Edge, or Opera for local folder analysis.');
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker();
      setIsIngesting(true);

      const files = [];
      const repoName = dirHandle.name;

      const readDirectory = async (handle, currentPath = '') => {
        const exclusions = [
          'node_modules', '.git', 'dist', 'build', '.next', 'out', 
          'coverage', '.cache', 'tmp', '.gemini', '.idea', '.vscode'
        ];
        
        for await (const entry of handle.values()) {
          if (exclusions.includes(entry.name)) continue;

          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          if (entry.kind === 'file') {
            const allowedExtensions = /\.(js|jsx|ts|tsx|py|html|css|json|md|txt)$/i;
            if (!allowedExtensions.test(entry.name)) continue;

            const file = await entry.getFile();
            if (file.size > 1500000) continue;

            const content = await file.text();
            files.push({
              path: relativePath,
              content
            });
          } else if (entry.kind === 'directory') {
            await readDirectory(entry, relativePath);
          }
        }
      };

      await readDirectory(dirHandle);

      if (files.length === 0) {
        alert('No compatible source code or text files found in the selected folder.');
        setIsIngesting(false);
        return;
      }

      const res = await api.post('/analysis/local', {
        repoName,
        files
      });

      if (res.data && res.data.analysisId) {
        navigate(`/analysis/${res.data.analysisId}`);
      }

    } catch (err) {
      console.error(err);
      if (err.name !== 'AbortError') {
        alert(err.response?.data?.error || err.message || 'Failed to process local directory analysis.');
      }
      setIsIngesting(false);
    }
  };

  const handleSendOtp = async () => {
    if (!resetEmail) return;
    setPwdLoading(true);
    setPwdMsg('');
    const res = await initiatePasswordReset(resetEmail);
    setPwdLoading(false);
    if (res.success) {
      setOtpSent(true);
      setPwdMsg('OTP sent to your email.');
    } else {
      setPwdMsg(res.error || 'Failed to send OTP.');
    }
  };

  const handleResetPassword = async () => {
    if (!otp || !newPassword) return;
    setPwdLoading(true);
    setPwdMsg('');
    const res = await resetPassword(resetEmail, otp, newPassword);
    setPwdLoading(false);
    if (res.success) {
      setPwdMsg('Password reset successfully.');
      setTimeout(() => {
        setIsEditingPassword(false);
        setOtpSent(false);
        setOtp('');
        setNewPassword('');
        setPwdMsg('');
      }, 2000);
    } else {
      setPwdMsg(res.error || 'Failed to reset password.');
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col px-6 py-8 relative max-w-7xl mx-auto w-full">
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] rounded-full bg-rose-900/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[500px] h-[500px] rounded-full bg-orange-900/5 blur-[120px] pointer-events-none" />

      <header 
        ref={headerRef} 
        className="glass-panel w-full px-6 py-4 rounded-2xl flex items-center justify-between border border-zinc-800/60 mb-10 z-40 relative"
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-zinc-900 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
            {/* Replaced Sparkles with beautiful GitBranch */}
            <GitBranch className="w-6 h-6 text-rose-400 text-glow" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-zinc-100">
            Repo<span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400">Forge</span>
          </span>
        </div>

        {/* Replaced right section with Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <UserCircle className="w-5 h-5 text-rose-400" />
            <ChevronDown className="w-4 h-4" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 z-50">
              <div className="p-2 flex flex-col">
                <button
                  onClick={() => { setIsCredentialsModalOpen(true); setIsProfileOpen(false); }}
                  className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-zinc-900 text-left transition-colors cursor-pointer"
                >
                  <User className="w-4 h-4 text-zinc-400" />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-200 truncate max-w-[180px]">{user?.name || 'User'}</span>
                    <span className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">Account Credentials</span>
                  </div>
                </button>

                <div className="h-[1px] w-full bg-zinc-800/60 my-1" />

                <button
                  onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                  className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-zinc-900 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <History className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-bold text-zinc-200">History</span>
                  </div>
                  {isHistoryOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                </button>

                {isHistoryOpen && (
                  <div className="px-3 pb-2 max-h-48 overflow-y-auto custom-scroll flex flex-col gap-1">
                    {history.length > 0 ? (
                      history.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => navigate(`/analysis/${item.analysisId}`)}
                          className="flex flex-col p-2 rounded-lg hover:bg-zinc-800/80 text-left transition-colors cursor-pointer"
                        >
                          <span className="text-xs text-zinc-300 font-mono truncate w-full">{item.repoUrl.replace('https://github.com/', '')}</span>
                          <span className="text-[9px] text-zinc-500">{formatDate(item.timestamp)}</span>
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-500 p-2 italic text-center">No history found.</span>
                    )}
                  </div>
                )}

                <div className="h-[1px] w-full bg-zinc-800/60 my-1" />

                <button
                  onClick={() => { setIsLogoutModalOpen(true); setIsProfileOpen(false); }}
                  className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-rose-500/10 hover:text-rose-400 text-zinc-300 text-left transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm font-bold">Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Ingestion Canvas (RESTORED OLD UI) */}
      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full mb-12">
        <div 
          ref={mainCardRef} 
          className="w-full glass-panel p-8 rounded-3xl border border-zinc-800/80 relative overflow-hidden text-center mb-8"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
          
          <h2 className="text-3xl font-extrabold text-zinc-100 tracking-tight mb-2">
            Forge Your Architecture Map
          </h2>
          <p className="text-zinc-400 text-sm max-w-xl mx-auto mb-8">
            Paste any public GitHub repository link below, or analyze a local directory recursively from your file system. RepoForge will map nodes, detect cycles, and score health metrics.
          </p>

          <form onSubmit={handleAnalyze} className="max-w-2xl mx-auto">
            <div className="relative flex flex-col md:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <GitBranch className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-500" />
                <input
                  type="url"
                  placeholder="https://github.com/username/repository"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full pl-13 pr-4 py-4 rounded-2xl bg-black/40 border border-zinc-800 focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/30 outline-none text-zinc-200 placeholder-zinc-600 transition-all font-mono text-sm"
                  required={!repoUrl}
                />
              </div>

              <button
                type="submit"
                disabled={isIngesting}
                className="glow-btn bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white font-bold px-8 py-4 rounded-2xl flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-[0_4px_20px_rgba(244,63,94,0.2)] disabled:opacity-50 w-full md:w-auto shrink-0"
              >
                <span>Forge Map</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>


          </form>
        </div>

        {/* Feature Highlights Bento-inspired Grid */}
        <div 
          ref={featureGridRef} 
          className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full"
        >
          {/* Card 1 */}
          <div className="glass-panel p-6 rounded-2xl border border-zinc-800/50 glass-card-hover text-left flex flex-col justify-between">
            <div>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 inline-block mb-4">
                <GitFork className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-100 mb-1">Visual Dependency Canvas</h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Explore a high-fidelity Zoom/Pan graph powered by React Flow with deep blast radius highlights.
              </p>
            </div>
            <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider mt-4">Module 1 Ready</span>
          </div>

          {/* Card 2 */}
          <div className="glass-panel p-6 rounded-2xl border border-zinc-800/50 glass-card-hover text-left flex flex-col justify-between">
            <div>
              <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 inline-block mb-4">
                <Binary className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-100 mb-1">Weighted Repo Score</h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Receive an authoritative quality grade calculated out of 10 based on circular loops, design patterns, and complexity.
              </p>
            </div>
            <span className="text-[10px] uppercase font-bold text-orange-400 tracking-wider mt-4">Module 2 Ready</span>
          </div>

          {/* Card 3 */}
          <div className="glass-panel p-6 rounded-2xl border border-zinc-800/50 glass-card-hover text-left flex flex-col justify-between">
            <div>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 inline-block mb-4">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-100 mb-1">Code Analyzer</h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Browse any file in your codebase with syntax highlighting, AI-powered descriptions, interactive chat, and full repository download.
              </p>
            </div>
            <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider mt-4">Module 3 Ready</span>
          </div>
        </div>
      </main>

      {/* LOADER OVERLAY */}
      {isIngesting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-md">
          <div className="relative mb-4">
            <Loader2 className="w-16 h-16 text-rose-500 animate-spin" />
            <div className="absolute inset-0 rounded-full bg-rose-500/10 blur-2xl animate-pulse" />
          </div>
          <h2 className="text-2xl font-extrabold text-zinc-100 mb-1">Forging Quality Map...</h2>
          <p className="text-zinc-400 text-sm max-w-sm text-center px-4 leading-relaxed">
            Parsing file tree, extracting import dependencies, and generating weighted multi-parameter score cards. This may take up to a minute for larger directories.
          </p>
        </div>
      )}

      {/* MODALS */}
      {/* 1. Credentials Modal */}
      {isCredentialsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
          <div className="glass-panel w-full max-w-md p-6 rounded-3xl border border-zinc-800 flex flex-col gap-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => { setIsCredentialsModalOpen(false); setIsEditingPassword(false); setPwdMsg(''); }}
              className="absolute top-5 right-5 p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800">
                <UserCircle className="w-8 h-8 text-rose-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-100">Account Credentials</h3>
                <p className="text-xs text-zinc-500">View or edit your profile information</p>
              </div>
            </div>

            <div className="space-y-4 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Full Name</span>
                <span className="text-sm font-semibold text-zinc-200">{user?.name}</span>
              </div>
              <div className="h-[1px] w-full bg-zinc-800/60" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Email Address</span>
                <span className="text-sm font-semibold text-zinc-200">{user?.email}</span>
              </div>
              <div className="h-[1px] w-full bg-zinc-800/60" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Password</span>
                <span className="text-sm font-mono text-zinc-200 tracking-widest">*******</span>
              </div>
            </div>


          </div>
        </div>
      )}

      {/* 2. Logout Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
          <div className="glass-panel w-full max-w-sm p-6 rounded-3xl border border-zinc-800 flex flex-col gap-6 relative animate-in fade-in zoom-in-95 duration-200 items-center text-center">
            
            <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20 mb-2">
              <LogOut className="w-8 h-8 text-rose-400" />
            </div>
            
            <div>
              <h3 className="text-xl font-bold text-zinc-100 mb-2">Confirm Logout</h3>
              <p className="text-sm text-zinc-400">Are you sure you want to log out of your RepoForge session?</p>
            </div>

            <div className="flex items-center gap-3 w-full mt-2">
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-colors shadow-[0_0_15px_rgba(225,29,72,0.3)] cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;