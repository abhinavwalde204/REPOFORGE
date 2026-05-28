import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

/**
 * Animated circular gauge for the Repo Health Score.
 * Score is 0-10. Circumference of r=56 circle = 351.86.
 * Collapsed: shows only the gauge + grade pill.
 * Expanded: shows quality breakdown rows + fix suggestions + stat pills.
 */
const CIRCUMFERENCE = 351.86;

function getScoreColor(score) {
  if (score >= 8) return { stroke: '#10b981', glow: '#10b98144', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', label: 'Excellent' };
  if (score >= 6) return { stroke: '#f59e0b', glow: '#f59e0b44', text: 'text-amber-400', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400', label: 'Moderate' };
  if (score >= 4) return { stroke: '#fb923c', glow: '#fb923c44', text: 'text-orange-400', badge: 'bg-orange-500/10 border-orange-500/30 text-orange-400', label: 'Fair' };
  return { stroke: '#f43f5e', glow: '#f43f5e44', text: 'text-rose-400', badge: 'bg-rose-500/10 border-rose-500/30 text-rose-400', label: 'Critical' };
}

function getParamColor(score) {
  if (score >= 8) return 'text-emerald-400';
  if (score >= 6) return 'text-amber-400';
  if (score >= 4) return 'text-orange-400';
  return 'text-rose-400';
}

const PARAMS_CONFIG = [
  {
    key: 'documentation',
    label: 'Documentation',
    weight: '20%',
    gradient: 'from-blue-500 to-indigo-500',
    fixHint: 'Add a detailed README with setup instructions, usage examples, and JSDoc/docstrings to key functions.',
    icon: '📄',
  },
  {
    key: 'security',
    label: 'Security',
    weight: '20%',
    gradient: 'from-emerald-500 to-teal-500',
    fixHint: 'Remove hardcoded secrets, avoid eval/exec patterns, add a .gitignore, and eliminate debug console.log statements from production code.',
    icon: '🔐',
  },
  {
    key: 'test_coverage',
    label: 'Test Coverage',
    weight: '18%',
    gradient: 'from-purple-500 to-pink-500',
    fixHint: 'Add test files (*.test.js / *.spec.js), set up a CI pipeline (GitHub Actions), and ensure assertions are present in all test suites.',
    icon: '✅',
  },
  {
    key: 'code_structure',
    label: 'Code Structure',
    weight: '17%',
    gradient: 'from-orange-500 to-amber-500',
    fixHint: 'Organise code into standard directories (src/, utils/, services/), break up files exceeding 500 lines, and enforce a consistent naming convention.',
    icon: '🏗️',
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    weight: '15%',
    gradient: 'from-cyan-500 to-blue-500',
    fixHint: 'Commit regularly (aim for ≥2 commits/week), keep dependencies up to date, and ensure the repository is actively maintained.',
    icon: '🔧',
  },
  {
    key: 'complexity',
    label: 'Complexity',
    weight: '10%',
    gradient: 'from-rose-500 to-red-500',
    fixHint: 'Refactor deeply nested logic, split functions with cyclomatic complexity >20, and aim for an average nesting depth below 3 levels.',
    icon: '🔀',
  },
];

/* ── Sub-components ─────────────────────────────────── */

const StatPill = ({ label, value, danger }) => (
  <div className="flex flex-col items-center p-2 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
    <span className={`text-sm font-extrabold ${danger ? 'text-rose-400' : 'text-zinc-100'}`}>{value}</span>
    <span className="text-[10px] text-zinc-500 mt-0.5 font-medium">{label}</span>
  </div>
);

const FixSuggestion = ({ text }) => (
  <div className="flex items-start gap-2 text-[11px] text-zinc-400 leading-relaxed bg-zinc-900/50 rounded-lg px-3 py-2 border border-zinc-800/60">
    <span className="text-amber-400 mt-0.5 flex-shrink-0">💡</span>
    <span>{text}</span>
  </div>
);

/* ── Main Component ─────────────────────────────────── */

const RepoScoreCard = ({ healthScore, metrics, repoScore }) => {
  const circleRef = useRef(null);
  const numberRef = useRef(null);
  const expandRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  const score = healthScore ?? 0;
  const { stroke, glow, text, badge, label } = getScoreColor(score);
  const targetOffset = CIRCUMFERENCE - (CIRCUMFERENCE * score) / 10;

  /* Gauge animation */
  useEffect(() => {
    if (circleRef.current) {
      gsap.fromTo(
        circleRef.current,
        { strokeDashoffset: CIRCUMFERENCE },
        { strokeDashoffset: targetOffset, duration: 1.4, ease: 'power3.out', delay: 0.2 }
      );
    }
    if (numberRef.current) {
      const obj = { val: 0 };
      gsap.to(obj, {
        val: score,
        duration: 1.4,
        ease: 'power3.out',
        delay: 0.2,
        onUpdate: () => {
          if (numberRef.current) numberRef.current.textContent = obj.val.toFixed(1);
        },
      });
    }
  }, [score]);

  /* Expand / collapse animation */
  useEffect(() => {
    if (!expandRef.current) return;
    if (expanded) {
      gsap.fromTo(
        expandRef.current,
        { opacity: 0, height: 0, marginTop: 0 },
        { opacity: 1, height: 'auto', marginTop: 16, duration: 0.45, ease: 'power3.out' }
      );
    } else {
      gsap.to(expandRef.current, { opacity: 0, height: 0, marginTop: 0, duration: 0.3, ease: 'power3.in' });
    }
  }, [expanded]);

  /* Collect fix suggestions only for parameters scoring < 8 */
  const fixes = repoScore?.parameters
    ? PARAMS_CONFIG.filter(p => (repoScore.parameters[p.key]?.score ?? 10) < 8)
    : [];

  return (
    <div
      className="glass-panel rounded-2xl border border-zinc-800/50 flex flex-col items-center overflow-hidden"
      style={{ padding: '24px 24px 20px' }}
    >
      {/* Title */}
      <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Repo Score</h2>

      {/* ── Clickable gauge area ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-label="Toggle quality breakdown"
        className="flex flex-col items-center gap-3 cursor-pointer group focus:outline-none"
        style={{ background: 'none', border: 'none', padding: 0 }}
      >
        {/* Gauge */}
        <div className="relative flex items-center justify-center">
          {/* Outer glow ring */}
          <div
            className="absolute rounded-full transition-opacity duration-300"
            style={{
              width: 148,
              height: 148,
              background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
              opacity: expanded ? 1 : 0.6,
            }}
          />
          <svg width="140" height="140" viewBox="0 0 128 128" className="-rotate-90 overflow-visible">
            {/* Track */}
            <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
            {/* Progress */}
            <circle
              ref={circleRef}
              cx="64" cy="64" r="56"
              fill="none"
              stroke={stroke}
              strokeWidth="10"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 10px ${stroke}99)` }}
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span ref={numberRef} className={`text-4xl font-extrabold ${text}`}>0.0</span>
            <span className="text-[10px] font-semibold text-zinc-500 mt-0.5">/ 10</span>
          </div>
        </div>

        {/* Grade badge */}
        <span className={`text-xs font-extrabold uppercase tracking-wider px-4 py-1 rounded-full border transition-all duration-300 ${badge}`}>
          {label}
        </span>

        {/* Expand hint */}
        <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors flex items-center gap-1 font-medium select-none">
          {expanded ? '▲ Hide details' : '▼ View breakdown'}
        </span>
      </button>

      {/* ── Collapsible expanded content ── */}
      <div ref={expandRef} className="w-full overflow-hidden" style={{ height: 0, opacity: 0 }}>
        {/* Quality Breakdown rows */}
        {repoScore?.parameters && (
          <div className="w-full flex flex-col gap-3 border-t border-zinc-800/50 pt-4">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Quality Breakdown</h3>
            {PARAMS_CONFIG.map((item, idx) => {
              const pData = repoScore.parameters[item.key] || { score: 0, issues: [] };
              const pScore = typeof pData.score === 'number' ? pData.score : 0;
              const barPercent = pScore * 10;
              const scoreColorClass = getParamColor(pScore);

              return (
                <div key={item.key} className="w-full group">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-zinc-300 flex items-center gap-1.5 font-medium">
                      <span className="text-sm leading-none">{item.icon}</span>
                      {item.label}
                      <span className="text-[9px] text-zinc-600 font-semibold">({item.weight})</span>
                    </span>
                    <span className={`font-extrabold font-mono text-xs ${scoreColorClass}`}>{pScore.toFixed(1)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-900/80">
                    <div
                      className={`h-full bg-gradient-to-r ${item.gradient} rounded-full transition-all duration-1000 ease-out`}
                      style={{ width: `${barPercent}%`, transitionDelay: `${idx * 80}ms` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Fix Suggestions */}
        {fixes.length > 0 && (
          <div className="w-full flex flex-col gap-2 mt-4 border-t border-zinc-800/50 pt-4">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <span className="text-amber-400">⚡</span> Suggested Fixes
            </h3>
            {fixes.map(p => (
              <FixSuggestion key={p.key} text={
                `${p.icon} ${p.label}: ${p.fixHint}`
              } />
            ))}
          </div>
        )}

        {/* Quick stat pills */}
        {metrics && (
          <div className="w-full grid grid-cols-2 gap-2 mt-4 border-t border-zinc-800/50 pt-4">
            <StatPill label="Files" value={metrics.total_files ?? '—'} />
            <StatPill label="LOC" value={metrics.total_loc ? metrics.total_loc.toLocaleString() : '—'} />
            <StatPill label="God Modules" value={metrics.god_modules_count ?? 0} danger={metrics.god_modules_count > 0} />
            <StatPill label="Critical Flags" value={metrics.critical_security_flags ?? 0} danger={metrics.critical_security_flags > 0} />
          </div>
        )}
      </div>
    </div>
  );
};

export default RepoScoreCard;
