import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  BarChart3,
  Clock,
  Flame,
  Brain,
  Activity,
  Sparkles,
  ShieldAlert,
  Target,
  CheckCircle2,
} from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip as RechartsTooltip,
} from 'recharts';

interface ReportSummary {
  momentum_or_pace_score: number;
  tier_label: string;
  deep_work_ratio_7d: number;
  current_streak: number;
  longest_streak: number;
  peak_focus_window: string;
  total_focus_hours: number;
  avg_burnout_pct: number;
}

interface DailySeriesItem {
  date: string;
  label: string;
  minutes_logged: number;
  target_minutes: number;
  day_status: 'untracked' | 'red' | 'yellow' | 'green' | 'golden';
  deep_work_ratio: number;
  rolling_score: number;
}

interface TopPlatformItem {
  name: string;
  clean_app: string;
  count: number;
  estimated_minutes: number;
  pct_of_distractions: number;
}

interface RecentDistractionItem {
  platform_name: string;
  clean_app_name: string;
  content_title: string;
  ai_summary: string;
  ai_reason: string;
  count: number;
  peak_hour: string;
  last_seen: string;
}

interface ReportData {
  summary: ReportSummary;
  daily_series: DailySeriesItem[];
  distractions_breakdown: {
    top_platforms: TopPlatformItem[];
    recent_distraction_items: RecentDistractionItem[];
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: number;
  workspaceName: string;
  category?: string;
  dailyTargetMinutes?: number;
}

const getBarColor = (status: string) => {
  switch (status) {
    case 'golden':
      return '#f59e0b';
    case 'green':
      return '#10b981';
    case 'yellow':
      return '#eab308';
    case 'red':
      return '#f43f5e';
    default:
      return '#27272a';
  }
};

const getTierBadgeClass = (tier: string) => {
  switch (tier) {
    case 'Strong':
      return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    case 'Solid':
      return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    case 'Shaky':
      return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    case 'Slipping':
      return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
    default:
      return 'bg-zinc-800 text-zinc-400 border border-zinc-700';
  }
};

const CustomBarTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as DailySeriesItem;
    return (
      <div className="bg-zinc-950/95 border border-zinc-800 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs space-y-1 font-mono">
        <p className="font-bold text-white text-sm mb-1">{data.label} ({data.date})</p>
        <p className="text-zinc-300">
          <span className="text-zinc-500">Logged:</span> <span className="font-bold text-white">{data.minutes_logged}m</span>
          {data.target_minutes > 0 && <span className="text-zinc-400"> / {data.target_minutes}m target</span>}
        </p>
        <p className="text-zinc-300">
          <span className="text-zinc-500">Deep Work Ratio:</span> <span className="text-emerald-400 font-bold">{data.deep_work_ratio}%</span>
        </p>
        <p className="text-zinc-300 capitalize">
          <span className="text-zinc-500">Status:</span>{' '}
          <span className={`font-bold ${
            data.day_status === 'golden' ? 'text-amber-400' :
            data.day_status === 'green' ? 'text-emerald-400' :
            data.day_status === 'yellow' ? 'text-amber-300' :
            data.day_status === 'red' ? 'text-rose-400' : 'text-zinc-500'
          }`}>{data.day_status}</span>
        </p>
      </div>
    );
  }
  return null;
};

export function WorkspaceReportModal({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  category,
  dailyTargetMinutes,
}: Props) {
  const [timeWindowDays, setTimeWindowDays] = useState<number>(30);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !workspaceId) return;

    let isMounted = true;
    const fetchReport = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/analytics/report?workspace_id=${workspaceId}&days=${timeWindowDays}`,
          { headers: getAuthHeaders(), cache: 'no-store' }
        );
        if (res.ok && isMounted) {
          const data = await res.json();
          setReportData(data);
        }
      } catch (err) {
        console.error('Error fetching workspace report data:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchReport();
    return () => { isMounted = false; };
  }, [isOpen, workspaceId, timeWindowDays]);

  if (!isOpen) return null;

  const targetLine = dailyTargetMinutes || (reportData?.daily_series?.[0]?.target_minutes) || 45;
  const categoryIcon = category === 'sprint' ? '🎯' : category === 'casual' ? '⚡' : '🌱';
  const categoryLabel = category === 'sprint' ? 'Sprint Track' : category === 'casual' ? 'Quick Work' : 'Mastery Track';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl flex flex-col p-6 md:p-8 space-y-6"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                    {workspaceName}
                  </h2>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                    {categoryIcon} {categoryLabel}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Target: {targetLine}m/day · Isolated workspace telemetry & behavioral intelligence
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              {/* Window Switcher */}
              <div className="flex items-center bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={() => setTimeWindowDays(14)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition-all ${
                    timeWindowDays === 14 ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  14d
                </button>
                <button
                  onClick={() => setTimeWindowDays(30)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition-all ${
                    timeWindowDays === 30 ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  30d
                </button>
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isLoading && !reportData ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-xs text-zinc-500 font-mono">Loading workspace telemetry...</p>
            </div>
          ) : reportData ? (
            <>
              {/* 1. 4-Card KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {/* 7d Pace */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      7d Pace
                    </span>
                    <Activity className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xl font-bold font-mono text-white">
                      {reportData.summary.momentum_or_pace_score}%
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getTierBadgeClass(reportData.summary.tier_label)}`}>
                      {reportData.summary.tier_label}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">Velocity vs target</span>
                </div>

                {/* Deep Work Ratio */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      Deep Work Ratio
                    </span>
                    <Brain className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      {reportData.summary.deep_work_ratio_7d}%
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">Focus purity ratio</span>
                </div>

                {/* Workspace Streak */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      Streak
                    </span>
                    <Flame className="w-4 h-4 text-orange-400" />
                  </div>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xl font-bold font-mono text-white">
                      🔥 {reportData.summary.current_streak}d
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Best: {reportData.summary.longest_streak}d
                  </span>
                </div>

                {/* Focus Hours Logged */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider font-semibold">
                      Total Hours
                    </span>
                    <Clock className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xl font-bold font-mono text-white">
                      {reportData.summary.total_focus_hours}h
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">Completed focus time</span>
                </div>
              </div>

              {/* 2. Daily Minutes vs Target Bar Chart */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                      <Target className="w-4 h-4 text-blue-400" />
                      <span>Daily Focus Minutes vs Target ({timeWindowDays}d)</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Dashed blue line shows daily required target ({targetLine}m). Color indicates status relative to target.
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono">
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> 1.5x+
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> 1x
                    </span>
                    <span className="flex items-center gap-1 text-yellow-400">
                      <span className="w-2 h-2 rounded-full bg-yellow-500" /> 0.5x
                    </span>
                    <span className="flex items-center gap-1 text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> &lt;0.5x
                    </span>
                  </div>
                </div>

                <div className="h-[230px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData.daily_series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                        tickLine={false}
                        axisLine={false}
                        unit="m"
                      />
                      <RechartsTooltip content={<CustomBarTooltip />} />
                      {targetLine > 0 && (
                        <ReferenceLine
                          y={targetLine}
                          stroke="#60a5fa"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                        />
                      )}
                      <Bar dataKey="minutes_logged" radius={[4, 4, 0, 0]}>
                        {reportData.daily_series.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getBarColor(entry.day_status)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 3. Granular Distraction Breakdown strictly restricted to this workspace */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-rose-400" />
                      <span>Distraction Intelligence & Interventions</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Background activity and AI-classified slips recorded during this workspace's sessions.
                    </p>
                  </div>
                </div>

                {reportData.distractions_breakdown.top_platforms.length === 0 &&
                 reportData.distractions_breakdown.recent_distraction_items.length === 0 ? (
                  <div className="py-8 px-4 text-center rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-emerald-400">Clean Focus Record</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Zero distracting interruptions recorded during {workspaceName} focus sessions.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Top Platforms */}
                    <div className="space-y-2.5">
                      <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                        Top Distraction Platforms
                      </h4>
                      <div className="space-y-2">
                        {reportData.distractions_breakdown.top_platforms.slice(0, 4).map((p, idx) => (
                          <div key={idx} className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs font-mono space-y-1.5">
                            <div className="flex items-center justify-between text-white font-medium">
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                {p.name}
                              </span>
                              <span className="text-zinc-400 text-[10px]">{p.count} slips ({p.estimated_minutes}m)</span>
                            </div>
                            <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.max(5, p.pct_of_distractions))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent Interventions */}
                    <div className="space-y-2.5">
                      <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                        Recent Interventions & Reasons
                      </h4>
                      <div className="space-y-2 max-h-[170px] overflow-y-auto custom-scrollbar pr-1">
                        {reportData.distractions_breakdown.recent_distraction_items.slice(0, 5).map((item, idx) => (
                          <div key={idx} className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                {item.platform_name || item.clean_app_name}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">{item.count}x · {item.peak_hour}</span>
                            </div>
                            <p className="text-white text-xs font-medium truncate" title={item.content_title}>
                              {item.content_title}
                            </p>
                            <p className="text-[11px] text-zinc-400 italic line-clamp-1">
                              "{item.ai_reason || item.ai_summary}"
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
