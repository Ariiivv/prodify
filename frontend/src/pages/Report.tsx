import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Clock,
  Flame,
  Brain,
  Activity,
  AlertTriangle,
  Calendar as CalendarIcon,
  Sparkles,
  Layers,
  TrendingUp,
  Target,
} from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import {
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { StructuredGoalCalendar, type CalendarDay } from '@/components/workspace/StructuredGoalCalendar';

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

interface WorkspaceTableItem {
  id: number;
  name: string;
  category: string;
  total_hours: number;
  today_minutes: number;
  daily_target_minutes: number;
  pace_score: number;
  pace_label: string;
  deep_work_ratio: number;
  current_streak: number;
  longest_streak: number;
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

interface HourlyDistItem {
  hour: number;
  label: string;
  count: number;
}

interface ReportData {
  summary: ReportSummary;
  daily_series: DailySeriesItem[];
  workspaces_table: WorkspaceTableItem[];
  distractions_breakdown: {
    top_platforms: TopPlatformItem[];
    recent_distraction_items: RecentDistractionItem[];
    hourly_distraction_distribution: HourlyDistItem[];
  };
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

const CustomTrendTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as DailySeriesItem;
    return (
      <div className="bg-zinc-950/95 border border-zinc-800 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs space-y-1.5 font-mono">
        <p className="font-bold text-white text-sm mb-1">{data.label}</p>
        <div className="flex items-center gap-2 text-blue-400">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span>Momentum / Pace: <strong>{data.rolling_score}%</strong></span>
        </div>
        <div className="flex items-center gap-2 text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Deep Work Ratio: <strong>{data.deep_work_ratio}%</strong></span>
        </div>
      </div>
    );
  }
  return null;
};

export default function Report() {
  const navigate = useNavigate();
  const [timeWindowDays, setTimeWindowDays] = useState<number>(30);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [homeMetrics, setHomeMetrics] = useState<any>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  // Initial fetch for workspaces list and home metrics
  useEffect(() => {
    const fetchBase = async () => {
      try {
        const [wsRes, sessRes, homeRes] = await Promise.all([
          fetch(`${API_BASE}/workspaces`, { headers: getAuthHeaders(), cache: 'no-store' }).catch(() => null),
          fetch(`${API_BASE}/api/telemetry/sessions?limit=200`, { headers: getAuthHeaders(), cache: 'no-store' }).catch(() => null),
          fetch(`${API_BASE}/api/metrics/home`, { headers: getAuthHeaders(), cache: 'no-store' }).catch(() => null),
        ]);
        if (wsRes && wsRes.ok) setWorkspaces(await wsRes.json());
        if (sessRes && sessRes.ok) setSessions(await sessRes.json());
        if (homeRes && homeRes.ok) setHomeMetrics(await homeRes.json());
      } catch (err) {
        console.error('Error fetching base report data:', err);
      }
    };
    fetchBase();
  }, []);

  // Fetch global report data when window changes
  useEffect(() => {
    let isMounted = true;
    const fetchReport = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/analytics/report?days=${timeWindowDays}`, {
          headers: getAuthHeaders(),
          cache: 'no-store',
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setReportData(data);
        }
      } catch (err) {
        console.error('Error fetching analytics report:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchReport();
    return () => { isMounted = false; };
  }, [timeWindowDays]);

  // Calendar data mapping
  const calendarData: CalendarDay[] = useMemo(() => {
    if (homeMetrics?.calendar) {
      return homeMetrics.calendar;
    }
    if (!reportData?.daily_series) return [];
    return reportData.daily_series.map((d) => ({
      date: d.date,
      status: d.day_status === 'untracked' ? null : d.day_status,
      actual_minutes: d.minutes_logged,
      target_minutes: d.target_minutes,
    }));
  }, [reportData, homeMetrics]);

  // Selected Day Breakdown for the Interactive Day Inspector
  const selectedDayInfo = useMemo(() => {
    if (!selectedDate) return null;

    const seriesEntry = reportData?.daily_series?.find(d => d.date === selectedDate);
    const calEntry = calendarData.find(d => d.date === selectedDate);

    const daySessions = sessions.filter(s => s.created_date && s.created_date.startsWith(selectedDate));
    const totalDayMinutes = daySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

    const dayTarget = seriesEntry?.target_minutes ?? calEntry?.target_minutes ?? 0;
    const dayActual = seriesEntry?.minutes_logged ?? calEntry?.actual_minutes ?? totalDayMinutes;

    const wsMap: Record<string, { name: string; minutes: number; sessionCount: number; targetMinutes?: number }> = {};
    daySessions.forEach(s => {
      const wsId = String(s.workspace_id || s.workspace_name || 'unknown');
      const wsObj = workspaces.find(w => w.id === s.workspace_id);
      const wsName = s.workspace_name || wsObj?.name || `Workspace #${wsId}`;
      if (!wsMap[wsId]) {
        wsMap[wsId] = {
          name: wsName,
          minutes: 0,
          sessionCount: 0,
          targetMinutes: wsObj?.daily_target_minutes,
        };
      }
      wsMap[wsId].minutes += s.duration_minutes || 0;
      wsMap[wsId].sessionCount += 1;
    });

    const activeWorkspaces = Object.values(wsMap).sort((a, b) => b.minutes - a.minutes);
    const isGoalMet = dayActual > 0 && ((dayTarget > 0 && dayActual >= dayTarget) || (dayTarget <= 0 && dayActual > 0) || seriesEntry?.day_status === 'green' || seriesEntry?.day_status === 'golden');
    const isPartial = dayActual > 0 && !isGoalMet;

    return {
      date: selectedDate,
      actualMinutes: dayActual,
      targetMinutes: dayTarget,
      sessionsCount: daySessions.length,
      activeWorkspaces,
      isGoalMet,
      isPartial,
      dayStatus: seriesEntry?.day_status || (isGoalMet ? 'green' : isPartial ? 'yellow' : 'untracked'),
      deepWorkRatio: seriesEntry?.deep_work_ratio ?? 0,
    };
  }, [selectedDate, reportData, calendarData, sessions, workspaces]);

  const activeDailyTarget = useMemo(() => {
    const sum = workspaces.reduce((acc, w) => acc + (w.daily_target_minutes || 0), 0);
    return sum > 0 ? sum : 60;
  }, [workspaces]);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
      {/* ── 1. Global Report Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            <span className="text-xs font-mono font-bold text-blue-400 tracking-widest uppercase">Global Analytics</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-white tracking-tight">
            Global Focus & Performance Report
          </h1>
          <p className="text-sm text-zinc-400 mt-1 font-body">
            Aggregated focus volume, consistency form, deep work purity, and distraction intelligence across all workspaces.
          </p>
        </div>

        {/* Time Window Selector */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 shadow-sm">
            <button
              onClick={() => setTimeWindowDays(14)}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-all ${
                timeWindowDays === 14 ? 'bg-zinc-800 text-white font-bold shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              14 Days
            </button>
            <button
              onClick={() => setTimeWindowDays(30)}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-all ${
                timeWindowDays === 30 ? 'bg-zinc-800 text-white font-bold shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              30 Days
            </button>
          </div>
        </div>
      </motion.div>

      {isLoading && !reportData ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-xs text-zinc-500 font-mono">Loading telemetry and behavior analytics...</p>
        </div>
      ) : reportData ? (
        <>
          {/* ── 2. Top KPI Command Row (5 Cards) ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
          >
            {/* Card 1: Momentum */}
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                  7d Momentum
                </span>
                <Activity className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold font-mono text-white">
                  {reportData.summary.momentum_or_pace_score}%
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getTierBadgeClass(reportData.summary.tier_label)}`}>
                  {reportData.summary.tier_label}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">7-day rolling performance</span>
            </div>

            {/* Card 2: Deep Work Ratio */}
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                  Deep Work Ratio
                </span>
                <Brain className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {reportData.summary.deep_work_ratio_7d}%
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">(Focus - Distracted) / Focus</span>
            </div>

            {/* Card 3: Active Streak */}
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                  Active Streak
                </span>
                <Flame className="w-4 h-4 text-orange-400" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold font-mono text-white">
                  🔥 {reportData.summary.current_streak}d
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">
                Longest: {reportData.summary.longest_streak}d
              </span>
            </div>

            {/* Card 4: Peak Focus Window */}
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                  Peak Window
                </span>
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm font-bold font-mono text-zinc-200 truncate">
                  {reportData.summary.peak_focus_window}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">Optimal alignment window</span>
            </div>

            {/* Card 5: Burnout Risk / Total Hours */}
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm backdrop-blur-md col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                  Cognitive Load
                </span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold font-mono text-white">
                  {reportData.summary.avg_burnout_pct}%
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  ({reportData.summary.total_focus_hours}h total)
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">Session fatigue index</span>
            </div>
          </motion.div>

          {/* ── 3. Calendar & Day Inspector Row ── */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-md p-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 border-b border-zinc-800/80 pb-4">
              <div>
                <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                  <span>Structured Goal Calendar</span>
                  {selectedWorkspaceId !== null && (
                    <span className="text-xs font-mono font-normal text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                      Scoped to {activeWorkspaceObj?.name}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Click any calendar date to inspect exact minutes logged, target alignment, and workspace contributions.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left: Monthly Calendar with Built-in Legend */}
              <div className="lg:col-span-6 xl:col-span-5">
                <StructuredGoalCalendar
                  workspaceId={selectedWorkspaceId || 0}
                  calendar={calendarData}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => setSelectedDate(date)}
                  showLegend={true}
                />
              </div>

              {/* Right: Interactive Day Inspector Panel */}
              <div className="lg:col-span-6 xl:col-span-7 bg-[#121214] border border-[#262626] rounded-2xl p-5 sm:p-6 shadow-inner flex flex-col justify-between min-h-[360px]">
                {selectedDayInfo && (
                  <div className="space-y-5">
                    {/* Date Header + Status Badge */}
                    <div className="flex items-center justify-between gap-3 border-b border-[#262626] pb-3">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-zinc-400" />
                        <h4 className="text-sm sm:text-base font-bold text-white tracking-tight font-mono">
                          {format(parseISO(selectedDayInfo.date), 'EEEE, MMMM d, yyyy')}
                        </h4>
                      </div>
                      {selectedDayInfo.dayStatus === 'golden' ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-400/20 text-amber-200 border border-amber-400 flex items-center gap-1.5 shadow-[0_0_10px_rgba(251,191,36,0.3)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" /> Exceeded Goal (1.5x+)
                        </span>
                      ) : selectedDayInfo.dayStatus === 'green' ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Goal Met
                        </span>
                      ) : selectedDayInfo.dayStatus === 'yellow' ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Partial Effort (0.5–1x)
                        </span>
                      ) : selectedDayInfo.dayStatus === 'red' ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Under Target (&lt;0.5x)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-[#181818] text-zinc-500 border border-[#262626]">
                          Inactive (0m logged)
                        </span>
                      )}
                    </div>

                    {/* Total Focus Time vs Target */}
                    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400 font-mono">
                          Focus Time vs Target
                        </span>
                        <span className="text-sm font-mono font-bold text-white">
                          {Math.round(selectedDayInfo.actualMinutes)}m
                          {selectedDayInfo.targetMinutes > 0 ? (
                            <span className="text-zinc-500 font-normal"> / {selectedDayInfo.targetMinutes}m required</span>
                          ) : (
                            <span className="text-zinc-500 font-normal"> logged</span>
                          )}
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${
                            selectedDayInfo.dayStatus === 'golden'
                              ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]'
                              : selectedDayInfo.dayStatus === 'green'
                                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
                                : selectedDayInfo.dayStatus === 'yellow'
                                  ? 'bg-amber-400' 
                                  : selectedDayInfo.dayStatus === 'red'
                                    ? 'bg-rose-500'
                                    : 'bg-zinc-700'
                          }`}
                          style={{ 
                            width: `${Math.min(100, selectedDayInfo.targetMinutes > 0 ? (selectedDayInfo.actualMinutes / selectedDayInfo.targetMinutes) * 100 : selectedDayInfo.actualMinutes > 0 ? 100 : 0)}%` 
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between mt-2.5 text-[11px] text-zinc-400 font-mono">
                        <span>Purity / Alignment: <strong className="text-emerald-400">{selectedDayInfo.deepWorkRatio}%</strong></span>
                        <span>{selectedDayInfo.sessionsCount} completed session{selectedDayInfo.sessionsCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    {/* Active Workspaces on that day */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-semibold text-zinc-300 font-mono">
                          {selectedWorkspaceId !== null ? 'Logged Activity' : `Active Workspaces (${selectedDayInfo.activeWorkspaces.length})`}
                        </span>
                      </div>

                      {selectedDayInfo.activeWorkspaces.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                          {selectedDayInfo.activeWorkspaces.map((ws, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-[#18181b] border border-[#27272a] rounded-xl">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-zinc-200">{ws.name}</span>
                                <span className="text-[10px] text-zinc-400 font-mono">{ws.sessionCount} session{ws.sessionCount !== 1 ? 's' : ''} completed</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-emerald-400">
                                  {ws.minutes >= 60 ? `${Math.floor(ws.minutes / 60)}h ${Math.round(ws.minutes % 60)}m` : `${Math.round(ws.minutes)}m`}
                                </span>
                                {ws.targetMinutes && ws.targetMinutes > 0 && ws.minutes >= ws.targetMinutes && (
                                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                                    Target met
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 px-4 bg-[#18181b]/50 border border-dashed border-[#27272a] rounded-xl">
                          <Clock className="w-5 h-5 text-zinc-600 mx-auto mb-1.5" />
                          <p className="text-xs text-zinc-400 font-medium">No sessions logged for this day</p>
                          <p className="text-[11px] text-zinc-600 mt-0.5">Click any active date on the calendar to view its session breakdown.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── 4. Upgraded Charts Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Daily Focus Minutes vs Target */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-md p-6 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4 border-b border-zinc-800/60 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-400" />
                    <span>Focus Minutes vs Target ({timeWindowDays}d)</span>
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Color indicates goal status. The blue dashed line indicates daily required quota.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg">
                  <span className="w-2 h-0.5 bg-blue-400 inline-block" />
                  <span>Target: {activeDailyTarget}m</span>
                </div>
              </div>

              <div className="h-[250px] w-full">
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
                    {activeDailyTarget > 0 && (
                      <ReferenceLine
                        y={activeDailyTarget}
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
            </motion.div>

            {/* Chart 2: 30-Day Momentum / Pace & Deep Work Ratio Trend */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-md p-6 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4 border-b border-zinc-800/60 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>Momentum & Deep Work Ratio Trend</span>
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Rolling 7-day consistency momentum curve mapped alongside focus purity ratio.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="flex items-center gap-1.5 text-blue-400">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Momentum
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Deep Work
                  </span>
                </div>
              </div>

              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={reportData.daily_series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorDWR" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                      tickLine={false}
                      axisLine={false}
                      unit="%"
                    />
                    <RechartsTooltip content={<CustomTrendTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="rolling_score"
                      name="Momentum / Pace"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorScore)"
                    />
                    <Area
                      type="monotone"
                      dataKey="deep_work_ratio"
                      name="Deep Work Ratio"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorDWR)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          {/* ── 5. Bottom Section: Workspace Leaderboard & Distraction Intelligence ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Card: Per-Workspace Performance Table */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="lg:col-span-6 xl:col-span-7 rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-md p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-zinc-800/60 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <span>Workspace Performance Leaderboard</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Performance overview across all your active workspaces. Click any workspace to open its focus space.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 text-[10px] uppercase tracking-wider">
                        <th className="pb-2.5 font-semibold">Workspace</th>
                        <th className="pb-2.5 font-semibold">Category</th>
                        <th className="pb-2.5 font-semibold text-right">Hours</th>
                        <th className="pb-2.5 font-semibold text-right">Pace</th>
                        <th className="pb-2.5 font-semibold text-right">Purity</th>
                        <th className="pb-2.5 font-semibold text-right">Streak</th>
                        <th className="pb-2.5 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {reportData.workspaces_table.map((ws) => (
                        <tr
                          key={ws.id}
                          onClick={() => navigate(`/workspace/${ws.id}`)}
                          className="transition-colors cursor-pointer group hover:bg-zinc-900/60"
                          title={`Open ${ws.name}`}
                        >
                          <td className="py-3 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white group-hover:text-blue-400 transition-colors">
                                {ws.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-2">
                            <span className="px-2 py-0.5 text-[10px] font-sans font-medium rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800 uppercase tracking-wider">
                              {ws.category}
                            </span>
                          </td>
                          <td className="py-3 text-right font-bold text-zinc-200">
                            {ws.total_hours}h
                          </td>
                          <td className="py-3 text-right">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${getTierBadgeClass(ws.pace_label)}`}>
                              {ws.pace_score}%
                            </span>
                          </td>
                          <td className="py-3 text-right font-bold text-emerald-400">
                            {ws.deep_work_ratio}%
                          </td>
                          <td className="py-3 text-right text-orange-400 font-bold">
                            🔥 {ws.current_streak}d
                          </td>
                          <td className="py-3 text-right">
                            <span className="text-[11px] text-zinc-500 group-hover:text-blue-400 transition-colors inline-flex items-center gap-1 font-sans">
                              Open →
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>

            {/* Right Card: Rich Distraction Intelligence */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="lg:col-span-6 xl:col-span-5 rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-md p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-zinc-800/60 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-rose-400" />
                      <span>Distraction Intelligence</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Granular activity telemetry classified by semantic intent.
                    </p>
                  </div>
                </div>

                {reportData.distractions_breakdown.top_platforms.length === 0 ? (
                  <div className="text-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl">
                    <Brain className="w-8 h-8 text-emerald-400/40 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-zinc-300">Zero Distractions Recorded</p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      You maintained a pristine focus session record across this window!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Top Platforms Breakdown */}
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                        Top Off-Task Platforms
                      </span>
                      <div className="space-y-2">
                        {reportData.distractions_breakdown.top_platforms.map((plat, idx) => (
                          <div key={idx} className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5">
                            <div className="flex items-center justify-between text-xs mb-1 font-mono">
                              <span className="font-bold text-zinc-200">
                                {plat.name} <span className="text-zinc-500 font-normal">({plat.clean_app})</span>
                              </span>
                              <span className="text-rose-400 font-semibold">
                                {plat.count} event{plat.count !== 1 ? 's' : ''} (~{plat.estimated_minutes}m)
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full"
                                style={{ width: `${Math.min(100, plat.pct_of_distractions)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Specific Content Item Highlights */}
                    {reportData.distractions_breakdown.recent_distraction_items.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                          Specific Content Interventions
                        </span>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                          {reportData.distractions_breakdown.recent_distraction_items.map((item, idx) => (
                            <div key={idx} className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-2.5 space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-mono">
                                <span className="text-blue-400 font-semibold truncate max-w-[200px]">
                                  {item.platform_name}
                                </span>
                                <span className="text-zinc-500 text-[10px]">
                                  {item.count} slip{item.count !== 1 ? 's' : ''} • Peak: {item.peak_hour}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-zinc-100 line-clamp-1">
                                "{item.content_title}"
                              </p>
                              {item.ai_summary && (
                                <span className="inline-block text-[10px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded-md">
                                  {item.ai_summary}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </div>
  );
}
