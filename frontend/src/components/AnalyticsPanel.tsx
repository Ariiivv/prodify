import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

interface AnalyticsPanelProps {
  workspaceId: number;
  workspaceName: string;
}

interface FocusDensityData {
  focus_density_score: number;
  total_focus_seconds: number;
  total_distractions: number;
}

interface DistractionVelocityData {
  timestamps: string[];
  velocities: number[];
}

interface VolumetricData {
  workspace_labels: string[];
  focus_minutes: number[];
}

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ workspaceId, workspaceName }) => {
  const [focusDensity, setFocusDensity] = useState<FocusDensityData | null>(null);
  const [distractionVelocity, setDistractionVelocity] = useState<DistractionVelocityData | null>(null);
  const [volumetric, setVolumetric] = useState<VolumetricData | null>(null);
  const [loading, setLoading] = useState(true);
  const [coachInsights, setCoachInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const generateInsights = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch(`${API_BASE}/api/telemetry/coach-insights?days=7`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCoachInsights(data.insights);
      } else {
        setCoachInsights("Unable to fetch AI coaching insights at this time.");
      }
    } catch (error) {
      console.error("Error fetching AI coach insights:", error);
      setCoachInsights("Connection error while generating AI insights.");
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const headers = getAuthHeaders();
        const [densityRes, velocityRes, volumetricRes] = await Promise.all([
          fetch(`${API_BASE}/api/telemetry/focus-density/${workspaceId}`, { headers }),
          fetch(`${API_BASE}/api/telemetry/distraction-velocity/${workspaceId}`, { headers }),
          fetch(`${API_BASE}/api/telemetry/volumetric-efficiency`, { headers }),
        ]);

        if (densityRes.ok) setFocusDensity(await densityRes.json());
        if (velocityRes.ok) setDistractionVelocity(await velocityRes.json());
        if (volumetricRes.ok) setVolumetric(await volumetricRes.json());
      } catch (error) {
        console.error('Analytics fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  // Build velocity chart data
  const velocityChartData = (distractionVelocity?.timestamps ?? []).map((ts, i) => ({
    time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    velocity: distractionVelocity!.velocities[i],
  }));

  // Build volumetric chart data
  const volumetricChartData = (volumetric?.workspace_labels ?? []).map((label, i) => ({
    name: label.length > 12 ? label.slice(0, 12) + '...' : label,
    minutes: volumetric!.focus_minutes[i],
  }));

  const fdsPercent = focusDensity ? (focusDensity.focus_density_score * 100).toFixed(1) : '--';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardVariants: any = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.1 * i, duration: 0.4, ease: 'easeOut' as const },
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartCardVariants: any = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.12 * i, duration: 0.45, ease: 'easeOut' as const },
    }),
  };

  return (
    <motion.div
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg w-full"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white tracking-tight">📊 Analytics</h2>
        {loading && <span className="text-xs text-slate-500 animate-pulse">Loading...</span>}
      </div>

      {/* AI Coach Pattern Insights */}
      <motion.div
        className="bg-gradient-to-br from-violet-950/40 via-slate-900 to-slate-900 rounded-xl p-4 mb-5 border border-violet-500/30 shadow-lg shadow-violet-500/5"
        custom={0}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🧠</span>
            <h3 className="text-xs font-semibold text-violet-300 tracking-wide uppercase">AI Pattern Coach</h3>
          </div>
          <button
            onClick={generateInsights}
            disabled={loadingInsights}
            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium transition-all duration-200 shadow-md shadow-violet-600/20 active:scale-95 flex items-center gap-1.5"
          >
            {loadingInsights ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <span>✨</span>
                Generate AI Insights
              </>
            )}
          </button>
        </div>
        {coachInsights ? (
          <div className="mt-3 p-3.5 rounded-lg bg-slate-950/60 border border-violet-500/20 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
            {coachInsights}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">
            Click above to generate a deep behavioral analysis of your window switching habits and distraction triggers.
          </p>
        )}
      </motion.div>

      {/* Focus Density Score */}
      <motion.div
        className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-4 mb-4 border border-slate-700/50"
        custom={0}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Focus Density Score</span>
          <span className="text-2xl font-bold text-violet-400">{fdsPercent}%</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
          <div
            className="h-2 rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${Math.min(100, focusDensity ? focusDensity.focus_density_score * 100 : 0)}%`,
              background: focusDensity && focusDensity.focus_density_score > 0.7
                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                : focusDensity && focusDensity.focus_density_score > 0.4
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #ef4444, #f87171)'
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>{focusDensity?.total_focus_seconds ?? 0}s focus</span>
          <span>{focusDensity?.total_distractions ?? 0} distractions</span>
        </div>
      </motion.div>

      {/* Distraction Velocity Chart */}
      <motion.div
        className="bg-slate-800/50 rounded-lg p-4 mb-4 border border-slate-700/50"
        custom={1}
        variants={chartCardVariants}
        initial="hidden"
        animate="visible"
      >
        <h3 className="text-xs text-slate-400 uppercase tracking-wider mb-3">Distraction Velocity</h3>
        {velocityChartData.length > 0 ? (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={velocityChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit="/min" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Line
                  type="monotone"
                  dataKey="velocity"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ fill: '#8b5cf6', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-slate-500 text-sm">
            Not enough data yet
          </div>
        )}
      </motion.div>

      {/* Volumetric Efficiency Chart */}
      <motion.div
        className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50"
        custom={2}
        variants={chartCardVariants}
        initial="hidden"
        animate="visible"
      >
        <h3 className="text-xs text-slate-400 uppercase tracking-wider mb-3">Volumetric Efficiency</h3>
        {volumetricChartData.length > 0 ? (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumetricChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 10 }} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(value: any) => [`${value} min`, 'Focus Time']}
                />
                <Bar dataKey="minutes" fill="#22c55e" radius={[0, 4, 4, 0]}>
                  {volumetricChartData.map((entry, index) => (
                    <rect key={index} fill={entry.name.includes(workspaceName.slice(0, 12)) ? '#8b5cf6' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-slate-500 text-sm">
            Complete sessions to see data
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default AnalyticsPanel;