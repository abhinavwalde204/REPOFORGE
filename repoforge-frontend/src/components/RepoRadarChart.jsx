import React from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

const AXIS_LABELS = {
  complexity: 'Complexity',
  modular: 'Modularity',
  security: 'Security',
  duplication: 'Uniqueness',
  coverage: 'Coverage'
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="glass-panel px-3 py-2 rounded-xl border border-zinc-700/60 text-xs">
        <p className="font-bold text-zinc-100">{d.axis}</p>
        <p className="text-rose-400 font-semibold">{d.value}<span className="text-zinc-500"> / 100</span></p>
      </div>
    );
  }
  return null;
};

const RepoRadarChart = ({ radarMetrics }) => {
  let data = [];

  if (Array.isArray(radarMetrics)) {
    // If it's already an array of objects
    data = radarMetrics.map((item) => {
      if (item && typeof item === 'object') {
        const axisValue = item.axis || item.subject || 'Metric';
        const numValue = Number(item.value ?? item.A ?? item.score ?? 0);
        return {
          axis: AXIS_LABELS[axisValue.toLowerCase()] || axisValue,
          value: isNaN(numValue) ? 0 : numValue
        };
      }
      return null;
    }).filter(Boolean);
  } else if (radarMetrics && typeof radarMetrics === 'object') {
    // If it's a key-value object
    data = Object.entries(radarMetrics).map(([key, val]) => {
      const numValue = typeof val === 'object' ? 0 : Number(val);
      return {
        axis: AXIS_LABELS[key] || key,
        value: isNaN(numValue) ? 0 : numValue
      };
    });
  }

  if (!data.length) return null;

  return (
    <div className="glass-panel p-5 rounded-2xl border border-zinc-800/50 flex flex-col gap-3">
      <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Architecture Radar</h2>

      <div className="w-full" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid
              stroke="rgba(255,255,255,0.07)"
              gridType="polygon"
            />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: '#71717a', fontSize: 11, fontWeight: 600 }}
              tickLine={false}
            />
            <Radar
              name="Score"
              dataKey="value"
              stroke="#f43f5e"
              fill="#f43f5e"
              fillOpacity={0.15}
              strokeWidth={2}
              dot={{ r: 3, fill: '#f43f5e', strokeWidth: 0 }}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        {data.map((d) => (
          <div key={d.axis} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: getColor(d.value) }}
            />
            <span className="text-[10px] text-zinc-400 font-medium">{d.axis}</span>
            <span className="text-[10px] font-bold" style={{ color: getColor(d.value) }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function getColor(val) {
  if (val >= 80) return '#10b981';
  if (val >= 60) return '#f59e0b';
  if (val >= 40) return '#fb923c';
  return '#f43f5e';
}

export default RepoRadarChart;
