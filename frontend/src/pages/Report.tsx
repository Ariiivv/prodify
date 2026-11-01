import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Flame,
  Brain,
  Activity,
  Calendar as CalendarIcon,
  Sparkles,
  Layers,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useCacheStore } from '@/store/cacheStore';
import { toLocalISODate } from '@/lib/dateUtils';
import { format, parseISO } from 'date-fns';
import { StructuredGoalCalendar, type CalendarDay } from '@/components/workspace/StructuredGoalCalendar';
import { MetricInfoPopover } from '@/components/ui/MetricInfoPopover';

interface ReportSummary {
  momentum_or_pace_score: number;
  tier_label: string;
  deep_work_ratio_7d: number;
  current_streak: number;
  longest_streak: number;
  peak_focus_window: string;
  total_focus_hours: number;
  total_sessions?: number;
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

export default function Report() {
  const navigate = useNavigate();
  const cachedDash = useCacheStore(state => state.dashboard);
  const [workspaces, setWorkspaces] = useState<any[]>(cachedDash.workspaces);
  const [sessions, setSessions] = useState<any[]>(cachedDash.sessions);
  const [homeMetrics, setHomeMetrics] = useState<any>(cachedDash.homeMetrics);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isDistractionsOpen, setIsDistractionsOpen] = useState(false);

  // Sync state whenever cached dashboard refreshes
  useEffect(() => {
    if (cachedDash.lastFetched > 0) {
      setWorkspaces(cachedDash.workspaces);
      setSessions(cachedDash.sessions);
      setHomeMetrics(cachedDash.homeMetrics);
    }
  }, [cachedDash]);

  // Initial fetch for workspaces list and home metrics via unified cache
  useEffect(() => {
    useCacheStore.getState().fetchDashboard();
  }, []);

  // Fetch global report data (standardized on 30-day window)
  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/report?days=30`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (err) {
      console.error('Error fetching analytics report:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport, cachedDash.lastFetched]);

  // Handle ESC key to dismiss modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLeaderboardOpen(false);
        setIsDistractionsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Prevent background scrolling when modal is active
  useEffect(() => {
    if (isLeaderboardOpen || isDistractionsOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isLeaderboardOpen, isDistractionsOpen]);

  const earliestCreatedDate = useMemo(() => {
    if (!workspaces || workspaces.length === 0) return '';
    return workspaces.reduce((earliest, ws) => {
      const wsLocal = toLocalISODate((ws as any).created_at);
      if (!wsLocal) return earliest;
      return !earliest || wsLocal < earliest ? wsLocal : earliest;
    }, '');
  }, [workspaces]);

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

    const wsMap: Record<number, { name: string; minutes: number; sessionCount: number; targetMinutes?: number }> = {};
    daySessions.forEach(s => {
      const wsId = s.workspace_id;
      const wsObj = workspaces.find(w => w.id === wsId);
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

  // Clean, single-sentence coaching insight summarizing current focus health
  const heroInsight = useMemo(() => {
    if (!reportData) return null;
    const { total_focus_hours, deep_work_ratio_7d, momentum_or_pace_score, current_streak } = reportData.summary;
    const topDistraction = reportData.distractions_breakdown?.top_platforms?.[0];
    const topDistName = topDistraction ? `${topDistraction.name || topDistraction.clean_app}` : null;

    if (total_focus_hours <= 0.05) {
      return {
        badge: 'Calibrating',
        badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
        sentence: 'Establish your baseline Deep Work and Momentum scores by launching your first focused sprint today.',
        icon: '⚡',
      };
    }

    if (momentum_or_pace_score >= 80) {
      return {
        badge: 'Apex Flow',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        sentence: `Outstanding execution: you're sustaining ${deep_work_ratio_7d}% focus purity across ${total_focus_hours}h logged with a solid ${current_streak}d streak.`,
        icon: '🔥',
      };
    }

    if (momentum_or_pace_score >= 50) {
      return {
        badge: 'On Track',
        badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        sentence: `Steady cadence with ${total_focus_hours}h logged and a ${current_streak}d streak${topDistName ? ` — watch out for drift on ${topDistName}` : ''}.`,
        icon: '⚡',
      };
    }

    return {
      badge: 'Attention Needed',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      sentence: `Focus momentum is slipping at ${momentum_or_pace_score}% with ${total_focus_hours}h logged; complete one structured 25m sprint today to protect your streak.`,
      icon: '⚠️',
    };
  }, [reportData]);

  const distractions_breakdown = reportData?.distractions_breakdown;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-3.5">
      {/* ── Page Header with Quick-Action Buttons ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-semibold text-zinc-100 bg-zinc-800 px-2 py-0.5 rounded tracking-[0.2em] uppercase border border-zinc-700/60">Global Analytics</span>
          </div>
          <h1 className="text-xl md:text-2xl font-heading font-bold text-zinc-100 tracking-tight">
            Focus & Performance Report
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5 font-body">
            30-day aggregated focus volume, consistency momentum, deep work purity, and distraction intelligence.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsLeaderboardOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition-colors shadow-sm cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-zinc-300" />
            <span>Workspace Leaderboard</span>
          </button>
          <button
            type="button"
            onClick={() => setIsDistractionsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition-colors shadow-sm cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Distraction Intelligence</span>
          </button>
        </div>
      </motion.div>

      {isLoading && !reportData ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-200 rounded-full animate-spin" />
          <p className="text-xs text-zinc-400 font-mono">Loading telemetry and behavior analytics...</p>
        </div>
      ) : reportData ? (
        <>
          {/* ── 1. Hero AI Verdict + Core KPIs (Side-by-side Row) ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch"
          >
            {/* Left: AI Performance Verdict */}
            {heroInsight && (
              <div className="lg:col-span-4 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3.5 flex flex-col justify-between shadow-sm backdrop-blur-md">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700/40 flex items-center justify-center text-sm shrink-0 shadow-inner">
                    {heroInsight.icon}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono font-semibold tracking-wider text-zinc-400 uppercase truncate">
                      AI Verdict
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 ${heroInsight.badgeClass}`}>
                      {heroInsight.badge}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-zinc-200 leading-relaxed font-body font-medium">
                  {heroInsight.sentence}
                </p>
              </div>
            )}

            {/* Right: 4 Core KPI Cards */}
            <div className={`${heroInsight ? 'lg:col-span-8' : 'lg:col-span-12'} grid grid-cols-2 sm:grid-cols-4 gap-2.5`}>
              {/* Card 1: 7D Consistency */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/70 rounded-xl p-3 flex flex-col justify-between shadow-sm backdrop-blur-md transition-all duration-150">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                      7D Consistency
                    </span>
                    <MetricInfoPopover
                      title="7D Consistency & Momentum"
                      description="Calculated from rolling 7-day consistency (active days), volume delivered vs target, and quality."
                      formula="(Consistency + Volume + Deep Work Ratio) / 3"
                      benchmark=">=80% Strong · 60-79% Solid · 40-59% Shaky · <40% Slipping"
                    />
                  </div>
                  <Activity className="w-3.5 h-3.5 text-zinc-300" />
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-xl font-bold font-mono text-zinc-100">
                    {reportData.summary.momentum_or_pace_score}%
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${getTierBadgeClass(reportData.summary.tier_label)}`}>
                    {reportData.summary.tier_label}
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1 mt-0.5 overflow-hidden">
                  <div 
                    className="bg-zinc-300 h-full rounded-full transition-all duration-300" 
                    style={{ width: `${Math.min(100, Math.max(0, reportData.summary.momentum_or_pace_score))}%` }}
                  />
                </div>
                <span className="text-[9px] text-zinc-400 font-mono mt-1 truncate">Rolling consistency score</span>
              </div>

              {/* Card 2: Deep Work Ratio */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/70 rounded-xl p-3 flex flex-col justify-between shadow-sm backdrop-blur-md transition-all duration-150">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                      Focus Purity
                    </span>
                    <MetricInfoPopover
                      title="Focus Purity"
                      description="Percentage of session time spent undistracted in focused flow."
                      formula="((Focus Time - Distracted Time) / Focus Time) × 100"
                      benchmark="Target: >85% deep flow purity"
                    />
                  </div>
                  <Brain className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  {reportData.summary.total_focus_hours > 0.05 ? (
                    <>
                      <span className="text-xl font-bold font-mono text-emerald-400">
                        {reportData.summary.deep_work_ratio_7d}%
                      </span>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {reportData.summary.deep_work_ratio_7d >= 80 ? 'Elite' : reportData.summary.deep_work_ratio_7d >= 60 ? 'Solid' : 'Low'}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-bold font-mono text-zinc-500">
                      — Calibrating
                    </span>
                  )}
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1 mt-0.5 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300" 
                    style={{ width: `${reportData.summary.total_focus_hours > 0.05 ? reportData.summary.deep_work_ratio_7d : 0}%` }}
                  />
                </div>
                <span className="text-[9px] text-zinc-400 font-mono mt-1 truncate">Focus vs. distraction purity</span>
              </div>

              {/* Card 3: Active Streak */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/70 rounded-xl p-3 flex flex-col justify-between shadow-sm backdrop-blur-md transition-all duration-150">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                      Active Streak
                    </span>
                    <MetricInfoPopover
                      title="Active Streak"
                      description="Consecutive days where you met your daily quota. In-progress days are protected with grace."
                      formula="Consecutive days with daily status >= Green"
                      benchmark="Keep daily quota cleared"
                      align="end"
                    />
                  </div>
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-xl font-bold font-mono text-zinc-100">
                    {reportData.summary.current_streak}d
                  </span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Best: {reportData.summary.longest_streak}d
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1 mt-0.5 overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-300" 
                    style={{ width: `${Math.min(100, (reportData.summary.current_streak / Math.max(1, reportData.summary.longest_streak || 7)) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-zinc-400 font-mono mt-1 truncate">Consecutive quota days</span>
              </div>

              {/* Card 4: Goal Execution / Completed Sessions */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/70 rounded-xl p-3 flex flex-col justify-between shadow-sm backdrop-blur-md transition-all duration-150">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                      Goal Execution
                    </span>
                    <MetricInfoPopover
                      title="Goal Execution & Volume"
                      description="Total focus hours logged alongside completed focus session count and daily volume velocity."
                      formula="Σ(Session Duration) in hours + Total Completed Sessions"
                      benchmark="Target: Steady daily session cadence"
                      align="end"
                    />
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300" />
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-xl font-bold font-mono text-zinc-100">
                    {reportData.summary.total_focus_hours}h
                  </span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700/50">
                    {reportData.summary.total_sessions ?? sessions.length} S
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1 mt-0.5 overflow-hidden">
                  <div 
                    className="bg-zinc-200 h-full rounded-full transition-all duration-300" 
                    style={{ width: `${Math.min(100, (reportData.summary.total_focus_hours / 60) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-zinc-400 font-mono mt-1 truncate">
                  {Math.round((reportData.summary.total_focus_hours * 60) / 30)}m/d avg velocity
                </span>
              </div>
            </div>
          </motion.div>

          {/* ── 2. Structured Goal Calendar & Day Inspector ── */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-sm p-4 backdrop-blur-md"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b border-zinc-800/80 pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-zinc-300" />
                  <span>Structured Goal Calendar</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Color-coded daily quota completion. Click any date to inspect exact minutes logged and workspace contributions.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left: Monthly Calendar with Built-in Legend */}
              <div className="lg:col-span-5">
                <StructuredGoalCalendar
                  workspaceId={0}
                  calendar={calendarData}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => setSelectedDate(date)}
                  showLegend={true}
                  createdDate={earliestCreatedDate}
                />
              </div>

              {/* Right: Interactive Day Inspector Panel */}
              <div className="lg:col-span-7 bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-4 shadow-inner flex flex-col justify-between min-h-[320px]">
                {selectedDayInfo && (
                  <div className="space-y-3.5">
                    {/* Date Header + Status Badge */}
                    <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-zinc-400" />
                        <h4 className="text-sm font-bold text-white tracking-tight font-mono">
                          {format(parseISO(selectedDayInfo.date), 'EEEE, MMMM d, yyyy')}
                        </h4>
                      </div>
                      {selectedDayInfo.dayStatus === 'golden' ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-400 text-zinc-950 flex items-center gap-1.5 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-xs bg-zinc-950" /> Exceeded Goal (1.5x+)
                        </span>
                      ) : selectedDayInfo.dayStatus === 'green' ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-emerald-500 text-zinc-950 flex items-center gap-1.5 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-xs bg-zinc-950" /> Goal Met
                        </span>
                      ) : selectedDayInfo.dayStatus === 'yellow' ? (
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-500/25 text-amber-100 border border-amber-500/40 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-xs bg-amber-400" /> Partial Effort (0.5–1x)
                        </span>
                      ) : selectedDayInfo.date === format(new Date(), 'yyyy-MM-dd') ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-zinc-900 text-zinc-200 border border-zinc-700 flex items-center gap-1.5">
                          <span className="w-1.5 h-0.5 rounded-full bg-zinc-300" /> Today (In Progress)
                        </span>
                      ) : selectedDayInfo.dayStatus === 'red' ? (
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-rose-950/70 text-rose-200 border border-rose-800/80 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-xs bg-rose-500" /> Under Target (&lt;0.5x)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-zinc-950 text-zinc-500 border border-zinc-800/80">
                          Inactive (0m logged)
                        </span>
                      )}
                    </div>

                    {/* Total Focus Time vs Target */}
                    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5">
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 font-mono">
                          Focus Time vs Target
                        </span>
                        <span className="text-xs font-mono font-bold text-white">
                          {Math.round(selectedDayInfo.actualMinutes)}m
                          {selectedDayInfo.targetMinutes > 0 ? (
                            <span className="text-zinc-500 font-normal"> / {selectedDayInfo.targetMinutes}m required</span>
                          ) : (
                            <span className="text-zinc-500 font-normal"> logged</span>
                          )}
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${
                            selectedDayInfo.dayStatus === 'golden'
                              ? 'bg-amber-400'
                              : selectedDayInfo.dayStatus === 'green'
                                ? 'bg-emerald-500' 
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

                      <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-400 font-mono">
                        <span>Purity / Alignment: <strong className="text-emerald-400">{selectedDayInfo.deepWorkRatio}%</strong></span>
                        <span>{selectedDayInfo.sessionsCount} completed session{selectedDayInfo.sessionsCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    {/* Active Workspaces on that day */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-zinc-300 font-mono">
                          Active Workspaces ({selectedDayInfo.activeWorkspaces.length})
                        </span>
                      </div>

                      {selectedDayInfo.activeWorkspaces.length > 0 ? (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                          {selectedDayInfo.activeWorkspaces.map((ws, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-lg">
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
                        <div className="text-center py-6 px-4 bg-zinc-950/40 border border-dashed border-zinc-800/80 rounded-xl">
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

          {/* ── 3. Quick Action Buttons for Workspace Leaderboard & Distraction Intelligence ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsLeaderboardOpen(true)}
              className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700 text-left transition-all group shadow-sm cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-zinc-300 group-hover:text-white transition-colors" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-white flex items-center gap-1.5">
                    <span>Workspace Performance Leaderboard</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    Cumulative volume & consistency across tracks
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 group-hover:text-zinc-200 font-mono shrink-0">
                <span>Open</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsDistractionsOpen(true)}
              className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700 text-left transition-all group shadow-sm cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-400 group-hover:text-amber-300 transition-colors" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-white flex items-center gap-1.5">
                    <span>Distraction Intelligence</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    {distractions_breakdown?.top_platforms?.length
                      ? `${distractions_breakdown.top_platforms.length} off-task platforms identified`
                      : 'Off-task telemetry & slips analysis'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 group-hover:text-zinc-200 font-mono shrink-0">
                <span>Open</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          </div>
        </>
      ) : null}

      {/* ── Modal 1: Workspace Performance Leaderboard ── */}
      <AnimatePresence>
        {isLeaderboardOpen && reportData && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsLeaderboardOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-3xl max-h-[85vh] bg-[#262624] border border-[#3d3d3a] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-[#3d3d3a]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#30302e] border border-[#3d3d3a] flex items-center justify-center">
                    <Layers className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
                      Workspace Performance Leaderboard
                    </h3>
                    <p className="text-[11px] text-[#a3a299]">
                      Cumulative volume and consistency across your active tracks. Click any row to enter the workspace.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLeaderboardOpen(false)}
                  className="p-1.5 rounded-lg text-[#a3a299] hover:text-white hover:bg-[#30302e] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Table Content */}
              <div className="overflow-y-auto p-5 custom-scrollbar">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#3d3d3a] text-[#a3a299] text-[10px] uppercase tracking-wider">
                      <th className="pb-2.5 font-semibold">Workspace</th>
                      <th className="pb-2.5 font-semibold">Track</th>
                      <th className="pb-2.5 font-semibold text-right">Hours</th>
                      <th className="pb-2.5 font-semibold text-right">Pace</th>
                      <th className="pb-2.5 font-semibold text-right">Purity</th>
                      <th className="pb-2.5 font-semibold text-right">Streak</th>
                      <th className="pb-2.5 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3d3d3a]">
                    {reportData.workspaces_table.map((ws) => (
                      <tr
                        key={ws.id}
                        onClick={() => {
                          setIsLeaderboardOpen(false);
                          navigate(`/workspace/${ws.id}`);
                        }}
                        className="transition-colors cursor-pointer group hover:bg-[#30302e]"
                        title={`Open ${ws.name}`}
                      >
                        <td className="py-3 pr-2">
                          <span className="font-semibold text-zinc-100 group-hover:text-white transition-colors">
                            {ws.name}
                          </span>
                        </td>
                        <td className="py-3 pr-2">
                          <span className="px-2 py-0.5 text-[10px] font-sans font-medium rounded-md bg-[#30302e] text-[#a3a299] border border-[#3d3d3a] uppercase tracking-wider">
                            {ws.category}
                          </span>
                        </td>
                        <td className="py-3 text-right font-bold text-zinc-100">
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
                        <td className="py-3 text-right text-amber-400 font-bold">
                          🔥 {ws.current_streak}d
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-[11px] text-[#a3a299] group-hover:text-zinc-100 transition-colors inline-flex items-center gap-1 font-sans">
                            Open <ArrowRight className="w-3 h-3" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal 2: Distraction Intelligence ── */}
      <AnimatePresence>
        {isDistractionsOpen && reportData && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsDistractionsOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-3xl max-h-[85vh] bg-[#262624] border border-[#3d3d3a] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-[#3d3d3a]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#30302e] border border-[#3d3d3a] flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
                      Distraction Intelligence
                    </h3>
                    <p className="text-[11px] text-[#a3a299]">
                      Off-task activity telemetry classified by the semantic engine.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDistractionsOpen(false)}
                  className="p-1.5 rounded-lg text-[#a3a299] hover:text-white hover:bg-[#30302e] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="overflow-y-auto p-5 custom-scrollbar">
                {!distractions_breakdown || distractions_breakdown.top_platforms.length === 0 ? (
                  <div className="text-center py-12 px-4 border border-dashed border-[#3d3d3a] rounded-xl">
                    <Brain className="w-8 h-8 text-emerald-400/40 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-zinc-300">Zero Distractions Recorded</p>
                    <p className="text-[11px] text-[#a3a299] mt-1">
                      You maintained a pristine focus session record across this window!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold text-[#a3a299] uppercase tracking-wider mb-3">
                      Top Off-Task Platforms & Apps
                    </div>
                    <div className="space-y-2">
                      {distractions_breakdown.top_platforms.map((platform, index) => {
                        const isExpanded = selectedPlatform === platform.name;
                        const matchingInterventions = distractions_breakdown.recent_distraction_items.filter(
                          (item) =>
                            item.platform_name.toLowerCase() === platform.name.toLowerCase() ||
                            item.clean_app_name.toLowerCase() === platform.name.toLowerCase() ||
                            platform.name.toLowerCase().includes(item.platform_name.toLowerCase()) ||
                            item.platform_name.toLowerCase().includes(platform.name.toLowerCase())
                        );

                        return (
                          <div key={index} className="space-y-1">
                            <button
                              type="button"
                              onClick={() => setSelectedPlatform(isExpanded ? null : platform.name)}
                              className={`w-full flex items-center justify-between p-3.5 rounded-lg border transition-colors cursor-pointer text-left ${
                                isExpanded
                                  ? 'bg-[#30302e] border-zinc-600'
                                  : 'bg-[#1f1e1d] border-[#3d3d3a] hover:border-zinc-600 hover:bg-[#30302e]'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0 pr-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-zinc-100 whitespace-nowrap">
                                    {platform.name}
                                  </span>
                                  {platform.clean_app && platform.clean_app.toLowerCase() !== platform.name.toLowerCase() && (
                                    <span className="text-xs text-[#a3a299] whitespace-nowrap">
                                      ({platform.clean_app})
                                    </span>
                                  )}
                                </div>
                                <div className="w-20 sm:w-28 h-1 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                                  <div
                                    className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full transition-all duration-300"
                                    style={{ width: `${Math.max(4, platform.pct_of_distractions)}%` }}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#30302e] text-zinc-300 border border-[#3d3d3a]">
                                  {platform.count} events
                                </span>
                                <span className="font-mono text-xs text-[#a3a299] hidden sm:inline">
                                  ~{platform.estimated_minutes}m lost
                                </span>
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-[#a3a299] shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-[#a3a299] shrink-0" />
                                )}
                              </div>
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.15 }}
                                  className="overflow-hidden pl-1 sm:pl-2 space-y-1 pt-1"
                                >
                                  {matchingInterventions.length > 0 ? (
                                    matchingInterventions.map((item, idx) => (
                                      <div
                                        key={idx}
                                        className="border-l-2 border-zinc-600 pl-3 py-2 my-1 bg-[#1f1e1d]/80 rounded-r-md text-left"
                                      >
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono">
                                          <span className="text-zinc-200 font-medium">
                                            "{item.content_title || item.platform_name}" — <span className="text-[#a3a299]">{item.count} slip{item.count !== 1 ? 's' : ''}</span> • <span className="text-zinc-500">Peak: {item.peak_hour}</span>
                                          </span>
                                        </div>
                                        {item.ai_summary && (
                                          <span className="inline-block text-[10px] font-mono bg-[#30302e] text-zinc-300 border border-[#3d3d3a] px-2 py-0.5 rounded mt-1.5">
                                            {item.ai_summary}
                                          </span>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="border-l-2 border-zinc-600 pl-3 py-2 my-1 bg-[#1f1e1d]/80 rounded-r-md text-[11px] font-mono text-[#a3a299]">
                                      "{platform.name}" — {platform.count} slips • Peak window across telemetry • ~{platform.estimated_minutes}m lost
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
