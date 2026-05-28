import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, GitBranch, AlertTriangle, ShieldCheck,
  Shield, Layers, Code2, Activity, Globe, Search
} from 'lucide-react';
import gsap from 'gsap';
import { cn } from '../utils/cn';
import api from '../services/api';
import DependencyGraph from '../components/DependencyGraph';
import RepoScoreCard from '../components/RepoScoreCard';
import RepoRadarChart from '../components/RepoRadarChart';

const SharedAnalysis = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // PR Impact states
  const [selectedPrFiles, setSelectedPrFiles] = useState(new Set());
  const [prFileSearch, setPrFileSearch] = useState('');

  useEffect(() => {
    const fetchSharedData = async () => {
      try {
        setLoading(true);
        // GET /api/share/:token is a public unauthenticated route
        const res = await api.get(`/share/${token}`);
        setData(res.data);
        
        // GSAP entry transition
        setTimeout(() => {
          if (containerRef.current) {
            gsap.fromTo(containerRef.current,
              { opacity: 0, y: 20 },
              { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }
            );
          }
        }, 50);
      } catch (err) {
        console.error('Error fetching shared analysis:', err);
        const errMsg = err.response?.data?.error || 'Shared analysis not found or link has expired.';
        setError(errMsg);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchSharedData();
    }
  }, [token]);

  // Compute PR Blast Radius BFS union client-side
  const { prImpactStats, customDirectSelectedNodeIds, customHighlightNodeIds, customDimmedNodeIds } = useMemo(() => {
    if (!data || selectedPrFiles.size === 0) {
      return {
        prImpactStats: null,
        customDirectSelectedNodeIds: null,
        customHighlightNodeIds: null,
        customDimmedNodeIds: null
      };
    }

    // Build adjacency mapping: target -> source
    const parentsMap = {};
    data.edges.forEach(e => {
      if (!parentsMap[e.target]) parentsMap[e.target] = [];
      parentsMap[e.target].push(e.source);
    });

    const affected = new Set();
    const queue = [...selectedPrFiles];

    while (queue.length > 0) {
      const curr = queue.shift();
      const parents = parentsMap[curr] || [];
      parents.forEach(p => {
        if (!affected.has(p) && !selectedPrFiles.has(p)) {
          affected.add(p);
          queue.push(p);
        }
      });
    }

    const totalCount = data.nodes.length;
    const affectedCount = affected.size + selectedPrFiles.size;
    const percentage = Math.round((affectedCount / totalCount) * 100);

    let severity = 'Low';
    let severityColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (percentage > 50) {
      severity = 'Critical';
      severityColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    } else if (percentage > 30) {
      severity = 'High';
      severityColor = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    } else if (percentage > 10) {
      severity = 'Medium';
      severityColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }

    const highlightSet = new Set([...selectedPrFiles, ...affected]);
    const dimmedSet = new Set();
    data.nodes.forEach(n => {
      if (!highlightSet.has(n.id)) {
        dimmedSet.add(n.id);
      }
    });

    const affectedFiles = data.nodes.filter(n => affected.has(n.id));

    return {
      prImpactStats: {
        percentage,
        severity,
        severityColor,
        affectedFiles,
        directFilesCount: selectedPrFiles.size
      },
      customDirectSelectedNodeIds: selectedPrFiles,
      customHighlightNodeIds: highlightSet,
      customDimmedNodeIds: dimmedSet
    };
  }, [data, selectedPrFiles]);

  const TABS = [
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'security', label: 'Security', icon: Shield },
    { key: 'patterns', label: 'Patterns', icon: Layers },
    { key: 'pr_impact', label: 'PR Impact', icon: GitBranch },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 gap-4 text-center">
        <div className="relative">
          <Loader2 className="w-12 h-12 text-rose-500 animate-spin" />
          <div className="absolute inset-0 rounded-full bg-rose-500/10 blur-xl" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-200 mb-1">Loading Public Codebase Map...</h2>
          <p className="text-zinc-500 text-sm">Fetching structural analysis from server...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 p-6 text-center">
        <div className="glass-panel max-w-md p-8 rounded-2xl border border-zinc-800 flex flex-col items-center justify-center gap-4">
          <AlertTriangle className="w-12 h-12 text-rose-500" />
          <h2 className="text-xl font-bold text-zinc-100">Link Unavailable</h2>
          <p className="text-zinc-400 text-sm">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="glow-btn bg-gradient-to-r from-rose-600 to-orange-500 text-white font-bold text-xs uppercase tracking-wider px-6 py-2.5 rounded-xl transition-all cursor-pointer mt-2"
          >
            Go to RepoForge
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-5 max-w-[1700px] mx-auto w-full relative bg-zinc-950">

      {/* Background gradients */}
      <div className="absolute top-1/4 left-0 w-[400px] h-[400px] rounded-full bg-rose-900/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-0 w-[400px] h-[400px] rounded-full bg-orange-900/5 blur-[120px] pointer-events-none" />

      {/* ── HEADER ── */}
      <header className="glass-panel w-full px-6 py-4 rounded-2xl flex items-center justify-between border border-zinc-800/60 mb-5 shrink-0 z-10">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="h-6 w-[1px] bg-zinc-800" />

          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-rose-400" />
              {data?.repoName}
            </h1>
            <a
              href={data?.githubUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-mono"
            >
              {data?.githubUrl}
            </a>
          </div>
        </div>

        {/* Public Shared View Badge */}
        <div className="flex items-center space-x-3">
          <div className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
            <Globe className="w-3.5 h-3.5" />
            <span>Public Shared View</span>
          </div>
        </div>
      </header>

      {/* ── MAIN GRID ── */}
      <main className="flex-1 w-full grid grid-cols-1 lg:grid-cols-4 gap-5 min-h-[600px] z-10">

        {/* ── LEFT SIDEBAR ── */}
        <div className="lg:col-span-1 flex flex-col gap-4">

          {/* Repo Score Card */}
          <RepoScoreCard healthScore={data.healthScore} metrics={data.metrics} repoScore={data.repoScore} />

          {/* Radar Chart */}
          {data?.metrics?.radar_metrics && (
            <RepoRadarChart radarMetrics={data.metrics.radar_metrics} />
          )}

          {/* Tabs Panel */}
          <div className="glass-panel p-5 rounded-2xl border border-zinc-800/50 flex-1 flex flex-col min-h-[280px]">

            {/* Tab buttons */}
            <div className="flex border-b border-zinc-800/80 pb-3 mb-4 gap-1 overflow-x-auto shrink-0 custom-scroll">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap',
                    activeTab === key
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scroll">

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-2">
                  <MetricRow label="Total Nodes (Files)" value={data.nodes.length} />
                  <MetricRow label="Total Edges (Imports)" value={data.edges.length} />
                  <MetricRow label="Total LOC" value={(data.metrics?.total_loc || 0).toLocaleString()} />
                  <MetricRow label="God Modules" value={data.metrics?.god_modules_count ?? 0} danger={data.metrics?.god_modules_count > 0} />
                  <MetricRow label="Critical Flags" value={data.metrics?.critical_security_flags ?? 0} danger={data.metrics?.critical_security_flags > 0} />
                  <MetricRow label="High Flags" value={data.metrics?.high_security_flags ?? 0} danger={data.metrics?.high_security_flags > 0} />
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-2">
                  {(!data.metrics?.security_issues || data.metrics.security_issues.length === 0) ? (
                    <EmptyState icon="✅" label="No security issues detected" />
                  ) : (
                    data.metrics.security_issues.map((issue, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/60">
                        <span className="text-[11px] text-zinc-500 block font-mono truncate mb-2" title={issue.file}>
                          {issue.file}
                        </span>
                        <div className="space-y-1">
                          {issue.risks.map((risk, rIdx) => (
                            <div key={rIdx} className="flex justify-between items-center text-[11px] bg-rose-950/25 px-2 py-1.5 rounded-lg border border-rose-500/10">
                              <span className="text-rose-300 font-semibold">{risk.type}</span>
                              <span className={cn(
                                'text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded',
                                risk.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' : 'bg-orange-500/20 text-orange-400'
                              )}>{risk.severity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Patterns Tab */}
              {activeTab === 'patterns' && (
                <div className="space-y-2">
                  {(!data.metrics?.design_patterns || data.metrics.design_patterns.length === 0) ? (
                    <EmptyState icon="🔍" label="No design patterns detected" />
                  ) : (
                    data.metrics.design_patterns.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/60">
                        <span className="text-[11px] text-zinc-500 block font-mono truncate mb-2" title={item.file}>
                          {item.file}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {item.patterns.map((pat, pIdx) => (
                            <span
                              key={pIdx}
                              className="text-[10px] bg-rose-950/30 text-rose-300 px-2 py-0.5 rounded-md border border-rose-500/15 font-semibold"
                            >
                              {pat}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* PR Impact Tab */}
              {activeTab === 'pr_impact' && (
                <div className="space-y-4 flex flex-col h-full">
                  <div className="flex flex-col gap-2 shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-600" />
                      <input
                        type="text"
                        placeholder="Search files to modify..."
                        value={prFileSearch}
                        onChange={(e) => setPrFileSearch(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-rose-500/40"
                      />
                    </div>
                    
                    {selectedPrFiles.size > 0 && (
                      <div className="flex justify-between items-center bg-zinc-900/40 border border-zinc-800/40 p-2 rounded-xl">
                        <span className="text-[11px] font-semibold text-zinc-400">{selectedPrFiles.size} files modified</span>
                        <button
                          onClick={() => setSelectedPrFiles(new Set())}
                          className="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-colors"
                        >
                          Reset Selection
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="max-h-[220px] overflow-y-auto border border-zinc-800/60 rounded-xl divide-y divide-zinc-800/40 bg-zinc-950/40 pr-1 custom-scroll shrink-0">
                    {data.nodes
                      .filter(node => node.id.toLowerCase().includes(prFileSearch.toLowerCase()))
                      .map(node => {
                        const isChecked = selectedPrFiles.has(node.id);
                        return (
                          <label
                            key={node.id}
                            className="flex items-start gap-3 p-2.5 hover:bg-zinc-900/30 cursor-pointer select-none transition-colors group"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const updated = new Set(selectedPrFiles);
                                if (updated.has(node.id)) {
                                  updated.delete(node.id);
                                } else {
                                  updated.add(node.id);
                                }
                                setSelectedPrFiles(updated);
                              }}
                              className="mt-0.5 accent-rose-500 cursor-pointer"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-zinc-300 group-hover:text-zinc-200 transition-colors font-medium truncate">
                                {node.name}
                              </span>
                              <span className="text-[10px] text-zinc-600 font-mono truncate">
                                {node.path}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                  </div>

                  {prImpactStats ? (
                    <div className="flex-1 flex flex-col gap-3 border-t border-zinc-800/50 pt-4 animate-in fade-in duration-200">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/40 flex flex-col">
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Blast Radius</span>
                          <span className="text-lg font-extrabold text-zinc-100 mt-1">{prImpactStats.percentage}%</span>
                          <span className="text-[10px] text-zinc-600 mt-0.5">of codebase affected</span>
                        </div>
                        <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/40 flex flex-col">
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Severity</span>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={cn(
                              "text-xs font-extrabold uppercase px-2 py-0.5 rounded border tracking-wider",
                              prImpactStats.severityColor
                            )}>
                              {prImpactStats.severity}
                            </span>
                          </div>
                        </div>
                      </div>

                      {prImpactStats.affectedFiles.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Downstream Dependents ({prImpactStats.affectedFiles.length})</span>
                          <div className="max-h-[140px] overflow-y-auto border border-zinc-800/60 rounded-xl divide-y divide-zinc-800/40 bg-zinc-950/40 pr-1 custom-scroll">
                            {prImpactStats.affectedFiles.map(file => (
                              <div key={file.id} className="p-2 flex items-center justify-between text-[11px]">
                                <span className="text-zinc-400 font-mono truncate max-w-[150px]" title={file.id}>
                                  {file.name}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-zinc-600 bg-zinc-900 px-1 py-0.2 rounded font-mono">{file.loc} LoC</span>
                                  <span className={cn(
                                    "px-1 py-0.2 rounded uppercase font-extrabold text-[9px]",
                                    file.complexity === 'high' ? 'text-rose-400 bg-rose-950/20' : 'text-emerald-400 bg-emerald-950/20'
                                  )}>{file.complexity}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-indigo-950/25 border border-indigo-500/15 text-[11px] text-indigo-300 leading-relaxed flex flex-col gap-1">
                        <span className="font-bold flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-indigo-400" />
                          Impact Recommendation
                        </span>
                        <span>
                          {prImpactStats.percentage > 30 
                            ? "Critical blast radius. Perform complete regression testing and review critical interface changes in downstream modules."
                            : `Modifying ${prImpactStats.directFilesCount} file${prImpactStats.directFilesCount > 1 ? 's' : ''} affects ${prImpactStats.affectedFiles.length} other module${prImpactStats.affectedFiles.length !== 1 ? 's' : ''}. Run targeted unit/integration tests on downstream dependents.`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-zinc-800/80 rounded-xl gap-2 min-h-[140px]">
                      <span className="text-2xl">⚡</span>
                      <h4 className="text-xs font-bold text-zinc-400">Zero Code Modded</h4>
                      <p className="text-[10px] text-zinc-600 max-w-[200px]">Check files in the tree above to calculate blast radius impact in real-time.</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── RIGHT CANVAS: React Flow Graph ── */}
        <div className="lg:col-span-3 glass-panel rounded-2xl border border-zinc-800/50 overflow-hidden flex flex-col relative">
          <DependencyGraph 
            rawNodes={data.nodes} 
            rawEdges={data.edges} 
            customDirectSelectedNodeIds={customDirectSelectedNodeIds}
            customHighlightNodeIds={customHighlightNodeIds}
            customDimmedNodeIds={customDimmedNodeIds}
          />
        </div>
      </main>

    </div>
  );
};

/* ── Helper components ── */
const MetricRow = ({ label, value, danger }) => (
  <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/40">
    <span className="text-xs text-zinc-400">{label}</span>
    <span className={`text-sm font-bold ${danger ? 'text-rose-400' : 'text-zinc-100'}`}>{value}</span>
  </div>
);

const EmptyState = ({ icon, label }) => (
  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
    <span className="text-2xl">{icon}</span>
    <span className="text-xs text-zinc-500 font-medium">{label}</span>
  </div>
);

export default SharedAnalysis;
