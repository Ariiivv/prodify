import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layers, BarChart3, Activity, Brain, Clock, Target, Flame, Zap, TrendingUp, ArrowRight } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useAuthStore } from '@/store/authStore';
import { useCacheStore } from '@/store/cacheStore';

import AnimatedBackground from '@/components/dashboard/AnimatedBackground';
import RecentActivity from '@/components/dashboard/RecentActivity';
import WorkspaceCard, { type WorkspaceMatrixItem } from '@/components/workspace/WorkspaceCard';
import CreateWorkspaceDialog from '@/components/workspace/CreateWorkspaceDialog';
import { MetricInfoPopover } from '@/components/ui/MetricInfoPopover';
import { SpotlightTour } from '@/components/onboarding/SpotlightTour';

interface Workspace {
  id: number;
  name: string;
  mode: string;
  category?: string;
  target_hours?: number;
  daily_target_minutes?: number;
  deadline?: string;
  work_duration?: number;
  focus_keywords?: string;
}

interface Session {
  id: number;
  workspace_id: number;
  duration_minutes: number;
  distraction_count: number;
  burnout_score?: number;
  created_date?: string;
}

interface GoalPlan {
  target_hours: number;
  deadline: string;
  deadline_display: string;
  days_remaining: number;
  historical_sprint_minutes: number;
  daily_target_minutes: number;
  daily_sessions_needed: number;
  completed_sessions_today: number;
  is_missed: boolean;
  status: string;
}

interface PerformanceMatrix {
  global_summary: {
    total_active_workspaces: number;
    workspaces_cleared_today: number;
    today_logged_minutes: number;
    today_target_minutes: number;
    today_target_hours: number;
    ten_day_form_pct: number;
    form_tier: string;
    focus_purity_pct: number;
    today_distractions_count: number;
    current_global_streak: number;
    longest_global_streak: number;
  };
  workspaces_matrix: WorkspaceMatrixItem[];
}

interface HomeMetrics {
  momentum: {
    score: number;
    label: string;
    consistency: number;
    volume: number;
    quality: number;
  };
  total_workspaces: number;
  deep_work_ratio_aggregate: number | null;
  peak_focus_window: {
    insufficient_data: boolean;
    peak_range?: string;
    alignment_rate?: number;
  };
  current_streak: number;
  longest_streak: number;
  calendar: any[];
}

const HomePage: React.FC = () => {
  const cachedDash = useCacheStore(state => state.dashboard);
  const hasCached = cachedDash.lastFetched > 0 || cachedDash.workspaces.length > 0;

  const [activeTab, setActiveTab] = useState<'all' | 'casual' | 'mastery' | 'sprint'>('all');
  const [dataWarnings, setDataWarnings] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<(Workspace & { category?: string })[]>(cachedDash.workspaces);
  const [sessions, setSessions] = useState<Session[]>(cachedDash.sessions);
  const [isLoading, setIsLoading] = useState(!hasCached);
  const [goalPlans, setGoalPlans] = useState<Record<number, GoalPlan>>({});
  const [recentLogs, setRecentLogs] = useState<Record<number, any[]>>({});
  const [homeMetrics, setHomeMetrics] = useState<HomeMetrics | null>(cachedDash.homeMetrics);
  const [performanceMatrix, setPerformanceMatrix] = useState<PerformanceMatrix | null>(cachedDash.performanceMatrix);

  // Isolated single-active tooltip state (prevents multiple open popovers)
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const toggleTooltip = (id: string, open?: boolean) => {
    setActiveTooltip(prev => {
      if (open === false) return prev === id ? null : prev;
      if (open === true) return id;
      return prev === id ? null : id;
    });
  };

  // Sync state seamlessly whenever cache updates
  useEffect(() => {
    if (cachedDash.lastFetched > 0) {
      setWorkspaces(cachedDash.workspaces);
      setSessions(cachedDash.sessions);
      setHomeMetrics(cachedDash.homeMetrics);
      setPerformanceMatrix(cachedDash.performanceMatrix);
      setIsLoading(false);
    }
  }, [cachedDash]);

  const fetchData = useCallback(async (force = false) => {
    try {
      const data = await useCacheStore.getState().fetchDashboard(force);
      setWorkspaces(data.workspaces);
      setSessions(data.sessions);
      setHomeMetrics(data.homeMetrics);
      setPerformanceMatrix(data.performanceMatrix);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setIsLoading(false);
    }
  }, []);

  const token = useAuthStore(state => state.session?.access_token);

  useEffect(() => {
    if (token) {
      // Stale-while-revalidate: renders immediately from cache if available, refreshes in background
      fetchData();
    }
  }, [fetchData, token]);

  const handleDeleted = useCallback((workspaceId: number) => {
    useCacheStore.getState().removeWorkspaceFromCache(workspaceId);
    setWorkspaces(prev => prev.filter(ws => ws.id !== workspaceId));
  }, []);

  // Unified User Performance Matrix & command metrics
  const globalSummary = performanceMatrix?.global_summary;
  const matrixByWsId: Record<number, WorkspaceMatrixItem> = (performanceMatrix?.workspaces_matrix || []).reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<number, WorkspaceMatrixItem>
  );

  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter(s => s.created_date && s.created_date.startsWith(today));
  const dailyFocusMinutes = todaySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const todayFocusHours = (dailyFocusMinutes / 60).toFixed(1);



  const sprintCount = workspaces.filter(ws => ws.category === 'sprint').length;
  const masteryCount = workspaces.filter(ws => ws.category === 'mastery' || !ws.category).length;
  const casualCount = workspaces.filter(ws => ws.category === 'casual').length;

  const filteredWorkspaces = workspaces.filter(ws => {
    if (activeTab === 'all') return true;
    const cat = ws.category || 'mastery';
    return cat === activeTab;
  });

  // Dynamic daily quota calculation: sum ONLY daily quotas, never multi-week total hours
  const calculateDailyQuotaMinutes = (ws: Workspace & { category?: string }) => {
    const cat = (ws.category || 'mastery').toLowerCase();
    if (cat === 'casual' || cat === 'quick_flow') {
      return 0;
    }
    const isSprint = cat === 'sprint';
    if (isSprint) {
      if (!ws.target_hours || !ws.deadline) {
        return Math.min(480, Math.max(15, ws.daily_target_minutes || 60));
      }
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const deadlineStr = typeof ws.deadline === 'string' ? ws.deadline.split('T')[0] : '';
      if (deadlineStr && deadlineStr < todayStr) {
        return 0; // Expired sprint has no daily quota
      }
      const deadlineDate = new Date(ws.deadline);
      const diffMs = deadlineDate.getTime() - now.getTime();
      const daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      const totalMinutes = ws.target_hours * 60;
      return Math.min(480, Math.max(15, Math.round(totalMinutes / daysRemaining)));
    }
    const raw = ws.daily_target_minutes || 60;
    return Math.min(480, Math.max(15, raw));
  };

  const dynamicDailyTargetMinutes = filteredWorkspaces.reduce((sum, ws) => sum + calculateDailyQuotaMinutes(ws), 0);
  const allWorkspacesDailyTargetMinutes = workspaces.reduce((sum, ws) => sum + calculateDailyQuotaMinutes(ws), 0);

  // When viewing a specific tab (sprint, mastery, quick work), scope to that tab; when viewing 'all', use globalSummary or all active
  const computedTodayTargetMinutes = activeTab !== 'all'
    ? dynamicDailyTargetMinutes
    : ((globalSummary && globalSummary.today_target_minutes > 0)
        ? globalSummary.today_target_minutes
        : allWorkspacesDailyTargetMinutes);

  const todayLoggedHours = globalSummary ? (globalSummary.today_logged_minutes / 60).toFixed(1) : todayFocusHours;
  const todayTargetHours = (computedTodayTargetMinutes / 60).toFixed(1);

  const momentumScore = homeMetrics?.momentum?.score != null 
    ? Math.round(homeMetrics.momentum.score) 
    : (globalSummary?.ten_day_form_pct != null ? Math.round(globalSummary.ten_day_form_pct) : null);

  const getMomentumLabel = (score: number | null, rawLabel?: string) => {
    if (rawLabel === 'Ready' || rawLabel === 'On Track') return rawLabel;
    if (rawLabel && rawLabel.toLowerCase() === 'calibrating') return 'Calibrating';
    if (globalSummary?.form_tier === 'Calibrating') return 'Calibrating';
    if (score == null) return 'Ready';
    if (score >= 80) return 'Strong';
    if (score >= 60) return 'Solid';
    if (score >= 40) return 'Shaky';
    if (sessions.length === 0 || dailyFocusMinutes === 0) return 'Ready';
    return 'Slipping';
  };

  const momentumLabel = getMomentumLabel(momentumScore, homeMetrics?.momentum?.label);

  const getMomentumColor = (label: string) => {
    switch (label) {
      case 'Strong': return 'text-emerald-400';
      case 'Solid': return 'text-blue-400';
      case 'On Track': return 'text-emerald-400';
      case 'Ready': return 'text-blue-400';
      case 'Shaky': return 'text-amber-400';
      case 'Slipping': return 'text-rose-400';
      default: return 'text-cyan-400';
    }
  };

  const deepWorkRatio = homeMetrics?.deep_work_ratio_aggregate != null 
    ? Math.round(homeMetrics.deep_work_ratio_aggregate)
    : (globalSummary?.focus_purity_pct != null ? Math.round(globalSummary.focus_purity_pct) : 0);

  const peakWindow = (!homeMetrics?.peak_focus_window || homeMetrics.peak_focus_window.insufficient_data || !homeMetrics.peak_focus_window.peak_range)
    ? 'Calibrating'
    : homeMetrics.peak_focus_window.peak_range;
  const peakSubtitle = homeMetrics?.peak_focus_window?.alignment_rate
    ? `${homeMetrics.peak_focus_window.alignment_rate}% Alignment`
    : '<14d Calibrating';

  const currentStreak = globalSummary?.current_global_streak ?? homeMetrics?.current_streak ?? 0;
  const longestStreak = globalSummary?.longest_global_streak ?? homeMetrics?.longest_streak ?? 0;



  return (
    <>
      <AnimatedBackground />

      <div className="p-6 md:p-10 max-w-6xl mx-auto relative z-10">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-start justify-between mb-8"
        >
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono font-semibold text-[#f4f4f5] bg-[#27272a] px-2 py-0.5 rounded tracking-[0.2em] uppercase border border-zinc-700/60">Prodify</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-[#f4f4f5] tracking-tight">Focus Tracks</h1>
            <p className="text-sm text-[#a1a1aa] mt-1 font-body">Focus smarter. Track burnout. Stay sharp.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/report"
              data-tour="sidebar-report"
              className="hidden md:flex items-center gap-2 px-3 py-2 border border-[#27272a] bg-[#202024] hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] text-xs font-mono font-medium rounded-xl transition-all shadow-sm"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Analytics
            </Link>
            <div data-tour="new-workspace">
              <CreateWorkspaceDialog onCreated={() => fetchData(true)} variant={workspaces.length === 0 ? "outline" : "primary"} />
            </div>
          </div>
        </motion.div>

        {/* ── Data Warnings Banner ── */}
        {dataWarnings.length > 0 && (
          <div className="flex items-center justify-between mb-4 bg-[#202024] border border-[#27272a] p-3 rounded-xl">
            <span className="text-sm font-medium text-amber-400">
              Some data couldn't load: {dataWarnings.join(', ')}
            </span>
            <button
              onClick={() => setDataWarnings([])}
              className="text-[#a1a1aa] hover:text-white transition-colors text-xs font-bold"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* ── Focus Command Strip ── */}
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            data-tour="hero-metrics"
            className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-row flex-wrap items-center justify-between gap-4 md:gap-8 bg-[#202024]/80 backdrop-blur-md border border-[#27272a] rounded-xl p-5 mb-8 w-full shadow-sm"
          >
            {/* 1. Today's Progress */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-[#27272a] border border-zinc-700/40 rounded-xl text-[#f4f4f5] shadow-inner">
                <Target className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-mono font-semibold">Today's Progress</span>
                  <MetricInfoPopover
                    title="Today's Progress"
                    description="Actual logged deep work time compared to your summed daily goal quotas across all active workspaces today. Measures your progress toward complete daily execution."
                    formula="Σ(Logged Focus Hours Today) / Σ(Daily Target Quota Hours)"
                    benchmark="Target: 100% of daily quota cleared"
                    isOpen={activeTooltip === 'progress'}
                    onToggle={(open) => toggleTooltip('progress', open)}
                  />
                </div>
                <span className="text-[#f4f4f5] font-mono font-bold text-sm sm:text-base">
                  {todayLoggedHours}h / {todayTargetHours}h
                </span>
                <span className="text-[10px] text-[#a1a1aa] font-mono">
                  {globalSummary ? (
                    globalSummary.total_active_workspaces > 0
                      ? `${globalSummary.workspaces_cleared_today} / ${globalSummary.total_active_workspaces} Cleared`
                      : 'Self-Paced / Flexible'
                  ) : 'Daily quota'}
                </span>
              </div>
            </div>

            {/* 2. 7D Consistency */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-[#27272a] border border-zinc-700/40 rounded-xl text-[#f4f4f5] shadow-inner">
                <Activity className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-mono font-semibold">7D Consistency</span>
                  <MetricInfoPopover
                    title="7D Consistency & Momentum"
                    description="Tracks your execution discipline over a rolling 7-day window. Evaluates active streak adherence, daily hours completed against target quotas, and focus quality."
                    formula="Composite of 7-Day Quota Completion (Volume), Days Active (Consistency), and Distraction Penalty (Quality)"
                    benchmark=">=80% Strong · 60-79% Solid · 40-59% Shaky · <40% Slipping"
                    isOpen={activeTooltip === 'consistency'}
                    onToggle={(open) => toggleTooltip('consistency', open)}
                  />
                </div>
                <span className="text-[#f4f4f5] font-mono font-bold text-sm sm:text-base">
                  {momentumScore != null ? `${momentumScore}%` : 'Calibrating'}
                </span>
                <span className={`text-[10px] font-semibold ${getMomentumColor(momentumLabel)}`}>
                  {momentumLabel}
                </span>
              </div>
            </div>

            {/* 3. Focus Purity */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-[#27272a] border border-zinc-700/40 rounded-xl text-[#f4f4f5] shadow-inner">
                <Brain className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-mono font-semibold">Focus Purity</span>
                  <MetricInfoPopover
                    title="Focus Purity"
                    description="The percentage of your total focused session time spent in deep flow without off-task diversions. Quantifies cognitive efficiency and attention quality."
                    formula="((Total Session Seconds - Distracted Seconds - Penalty) / Total Session Seconds) × 100"
                    benchmark="Aim for >85% purity for sustained high-performance cognitive work"
                    isOpen={activeTooltip === 'purity'}
                    onToggle={(open) => toggleTooltip('purity', open)}
                  />
                </div>
                <span className="text-emerald-400 font-mono font-bold text-sm sm:text-base">
                  {deepWorkRatio}%
                </span>
                <span className="text-[10px] text-[#a1a1aa] font-mono">
                  {globalSummary?.today_distractions_count != null ? `${globalSummary.today_distractions_count} slips today` : '7d purity'}
                </span>
              </div>
            </div>

            {/* 4. Peak Hour (14D Model) */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-[#27272a] border border-zinc-700/40 rounded-xl text-[#f4f4f5] shadow-inner">
                <Clock className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-mono font-semibold">Peak Hour (14D Model)</span>
                  <MetricInfoPopover
                    title="Peak Hour (14D Machine Learning Model)"
                    description="Your chronobiological peak focus window discovered by machine learning telemetry. Continuously calibrated over a rolling 14-day history by clustering hourly alignment rates, session lengths, and low-distraction intervals."
                    formula="argmax_hour(Σ(Aligned Seconds) / (Σ(Total Logged Seconds) + ε)) across 14-day telemetry"
                    benchmark="Schedule your most challenging, creative, or complex work during this peak hour"
                    align="end"
                    isOpen={activeTooltip === 'peak'}
                    onToggle={(open) => toggleTooltip('peak', open)}
                  />
                </div>
                <span className="font-mono font-bold text-xs sm:text-sm tracking-tight text-zinc-200">
                  {peakWindow}
                </span>
                <span className="text-[10px] text-[#a1a1aa] font-mono">
                  {peakSubtitle}
                </span>
              </div>
            </div>

            {/* 5. Active Streak */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-amber-500/10 border border-amber-500/25 rounded-xl">
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-mono font-semibold">Active Streak</span>
                  <MetricInfoPopover
                    title="Active Streak"
                    description="The number of consecutive days you have met your daily focus quota across all active workspaces. Today's in-progress day is granted grace so streaks are never broken prematurely while you are working."
                    formula="Consecutive days where Daily Progress reached >= 100% target quota"
                    benchmark="Clear today's target quota to extend and defend your active streak"
                    align="end"
                    isOpen={activeTooltip === 'streak'}
                    onToggle={(open) => toggleTooltip('streak', open)}
                  />
                </div>
                <span className="text-amber-400 font-mono font-bold text-sm sm:text-base">
                  {currentStreak} Day{currentStreak !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] text-[#a1a1aa] font-mono">
                  Best: {longestStreak}d
                </span>
              </div>
            </div>
          </motion.div>

        {/* ── Workspaces Section ── */}
        <div className="space-y-6" id="workspaces">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#27272a] pb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 text-xs font-medium transition-all rounded-lg border ${
                  activeTab === 'all' 
                    ? 'text-[#f4f4f5] bg-[#27272a] border-zinc-700/60 shadow-sm' 
                    : 'text-[#a1a1aa] border-transparent hover:text-[#f4f4f5] hover:bg-[#202024]'
                }`}
              >
                All ({workspaces.length})
              </button>
              <button
                onClick={() => setActiveTab('casual')}
                className={`px-3 py-1.5 text-xs font-medium transition-all rounded-lg flex items-center gap-1.5 border ${
                  activeTab === 'casual' 
                    ? 'text-[#f4f4f5] bg-[#27272a] border-zinc-700/60 shadow-sm' 
                    : 'text-[#a1a1aa] border-transparent hover:text-[#f4f4f5] hover:bg-[#202024]'
                }`}
              >
                <Zap className="w-3.5 h-3.5" /> Quick Work ({casualCount})
              </button>
              <button
                onClick={() => setActiveTab('mastery')}
                className={`px-3 py-1.5 text-xs font-medium transition-all rounded-lg flex items-center gap-1.5 border ${
                  activeTab === 'mastery' 
                    ? 'text-[#f4f4f5] bg-[#27272a] border-zinc-700/60 shadow-sm' 
                    : 'text-[#a1a1aa] border-transparent hover:text-[#f4f4f5] hover:bg-[#202024]'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" /> Mastery ({masteryCount})
              </button>
              <button
                onClick={() => setActiveTab('sprint')}
                className={`px-3 py-1.5 text-xs font-medium transition-all rounded-lg flex items-center gap-1.5 border ${
                  activeTab === 'sprint' 
                    ? 'text-amber-300 bg-[#27272a] border-zinc-700/60 shadow-sm' 
                    : 'text-[#a1a1aa] border-transparent hover:text-[#f4f4f5] hover:bg-[#202024]'
                }`}
              >
                <Target className="w-3.5 h-3.5" /> Sprints ({sprintCount})
              </button>
            </div>

            <div className="text-xs text-zinc-500 font-mono hidden sm:block">
              {filteredWorkspaces.length} workspace{filteredWorkspaces.length === 1 ? '' : 's'} displayed
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map(i => (
                <div key={i} className="border border-prodify-border bg-prodify-surface p-5 animate-pulse rounded-xl h-64">
                  <div className="w-10 h-10 bg-prodify-surface-alt mb-4 rounded-xl" />
                  <div className="h-4 bg-prodify-surface-alt w-2/3 mb-2 rounded" />
                  <div className="h-3 bg-prodify-surface-alt w-1/3 rounded" />
                </div>
              ))}
            </div>
          ) : filteredWorkspaces.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 border border-dashed border-prodify-border rounded-xl flex flex-col items-center justify-center bg-zinc-950/30"
            >
              <Layers className="w-10 h-10 text-prodify-muted/30 mx-auto mb-4" />
              <p className="text-[#888888] text-sm mb-6">No workspaces found in this category.</p>
              {activeTab === 'all' && <CreateWorkspaceDialog onCreated={fetchData} />}
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-tour="workspace-cards">
              {filteredWorkspaces.map((ws, i) => {
                const wsSessionMinutes = sessions
                  .filter(s => s.workspace_id === ws.id)
                  .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
                  
                return (
                  <WorkspaceCard 
                    key={ws.id} 
                    workspace={ws} 
                    index={i} 
                    onDeleted={handleDeleted} 
                    onUpdated={() => fetchData(true)}
                    totalMinutesLogged={wsSessionMinutes}
                    matrixItem={matrixByWsId[ws.id]}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── Recent Activity Section (Spacious Bottom Container) ── */}
        <div className="mt-14 pt-8 border-t border-zinc-800/80" data-tour="recent-activity">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-bold text-white tracking-wider uppercase font-mono">
                Recent Activity & Flow Telemetry
              </h3>
            </div>
            <Link
              to="/report"
              className="text-xs text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 transition-colors group"
            >
              Full Analytics History <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <RecentActivity sessions={sessions} workspaces={workspaces} />
        </div>
      </div>

      {/* Spotlight Interactive Onboarding Tour */}
      <SpotlightTour />
    </>
  );
};

export default HomePage;
