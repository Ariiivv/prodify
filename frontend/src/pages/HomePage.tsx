import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layers, BarChart3, Activity, Brain, Clock, Target, Flame, Zap, TrendingUp } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useAuthStore } from '@/store/authStore';

import AnimatedBackground from '@/components/dashboard/AnimatedBackground';
import RecentActivity from '@/components/dashboard/RecentActivity';
import WorkspaceCard, { type WorkspaceMatrixItem } from '@/components/workspace/WorkspaceCard';
import CreateWorkspaceDialog from '@/components/workspace/CreateWorkspaceDialog';

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
  daily_minutes_required: number;
  sessions_per_day: number;
  morning_sessions: number;
  afternoon_sessions: number;
}

interface DistractionData {
  top_apps: { app: string; count: number }[];
  peak_hour: number;
  total_events: number;
}

interface GlobalSummary {
  workspaces_cleared_today: number;
  total_active_workspaces: number;
  today_logged_minutes: number;
  today_target_minutes: number;
  ten_day_form_pct: number;
  form_tier: string;
  focus_purity_pct: number;
  today_distractions_count: number;
  daily_verdict: string;
  current_global_streak: number;
  longest_global_streak: number;
}

interface PerformanceMatrix {
  global_summary: GlobalSummary;
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
  const [activeTab, setActiveTab] = useState<'all' | 'sprint' | 'mastery'>('all');
  const [dataWarnings, setDataWarnings] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<(Workspace & { category?: string })[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [goalPlans, setGoalPlans] = useState<Record<number, GoalPlan>>({});
  const [recentLogs, setRecentLogs] = useState<Record<number, any[]>>({});
  const [homeMetrics, setHomeMetrics] = useState<HomeMetrics | null>(null);
  const [performanceMatrix, setPerformanceMatrix] = useState<PerformanceMatrix | null>(null);

  const fetchData = useCallback(async () => {
    try {
      let headers = getAuthHeaders();
      // If token isn't ready for some reason, wait a beat
      if (!headers.Authorization) {
        await new Promise(r => setTimeout(r, 500));
        headers = getAuthHeaders();
      }

      const warnings: string[] = [];

      // 1. Workspaces (Fault-tolerant independent fetch)
      try {
        const res = await fetch(`${API_BASE}/workspaces`, { headers, cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setWorkspaces(data);
        } else {
          warnings.push("Workspaces");
        }
      } catch (e) {
        console.error("Failed to fetch workspaces:", e);
        warnings.push("Workspaces");
      }

      // 2. Metrics (Fault-tolerant independent fetch)
      try {
        const res = await fetch(`${API_BASE}/api/metrics/home`, { headers, cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setHomeMetrics(data);
        } else {
          warnings.push("Metrics");
        }
      } catch (e) {
        console.error("Failed to fetch metrics:", e);
      }

      // 3. Sessions (Fault-tolerant independent fetch)
      try {
        const res = await fetch(`${API_BASE}/api/telemetry/sessions?limit=100`, { headers, cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
        } else {
          warnings.push("Sessions");
        }
      } catch (e) {
        console.error("Failed to fetch sessions:", e);
      }

      // 4. Performance Matrix (Fault-tolerant independent fetch)
      try {
        const res = await fetch(`${API_BASE}/api/analytics/performance-matrix`, { headers, cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setPerformanceMatrix(data);
        } else {
          warnings.push("Performance Matrix");
        }
      } catch (e) {
        console.error("Failed to fetch performance matrix:", e);
      }

      if (warnings.length > 0) {
        setDataWarnings(warnings);
      } else {
        setDataWarnings([]);
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setIsLoading(false);
    }
  }, []);

  const token = useAuthStore(state => state.session?.access_token);

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [fetchData, token]);

  const handleDeleted = useCallback((workspaceId: number) => {
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
  const dailyTargetMinutes = workspaces.reduce((sum, ws) => sum + (ws.daily_target_minutes || 0), 0);
  const targetDisplay = dailyTargetMinutes > 0 ? ` / ${(dailyTargetMinutes / 60).toFixed(1)}h` : '';

  // 7-Day Metrics Spec Alignment
  const todayLoggedHours = globalSummary ? (globalSummary.today_logged_minutes / 60).toFixed(1) : todayFocusHours;
  const todayTargetHours = globalSummary ? (globalSummary.today_target_minutes / 60).toFixed(1) : (dailyTargetMinutes > 0 ? (dailyTargetMinutes / 60).toFixed(1) : '0.0');

  const momentumScore = homeMetrics?.momentum?.score != null 
    ? Math.round(homeMetrics.momentum.score) 
    : (globalSummary?.ten_day_form_pct != null ? Math.round(globalSummary.ten_day_form_pct) : null);

  const getMomentumLabel = (score: number | null, rawLabel?: string) => {
    if (rawLabel && rawLabel.toLowerCase() === 'calibrating') return 'Calibrating';
    if (globalSummary?.form_tier === 'Calibrating') return 'Calibrating';
    if (score == null) return 'Calibrating';
    if (score >= 80) return 'Strong';
    if (score >= 60) return 'Solid';
    if (score >= 40) return 'Shaky';
    return 'Slipping';
  };

  const momentumLabel = getMomentumLabel(momentumScore, homeMetrics?.momentum?.label);

  const getMomentumColor = (label: string) => {
    switch (label) {
      case 'Strong': return 'text-emerald-400';
      case 'Solid': return 'text-blue-400';
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

  const sprintCount = workspaces.filter(ws => ws.category === 'sprint').length;
  const masteryCount = workspaces.filter(ws => ws.category === 'mastery' || !ws.category).length;
  const casualCount = workspaces.filter(ws => ws.category === 'casual').length;

  const filteredWorkspaces = workspaces.filter(ws => {
    if (activeTab === 'all') return true;
    const cat = ws.category || 'mastery';
    return cat === activeTab;
  });

  return (
    <>
      <AnimatedBackground />

      <div className="p-6 md:p-10 max-w-6xl mx-auto relative z-10">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-start justify-between mb-10"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold text-white bg-prodify-surface-alt px-2 py-0.5 rounded tracking-[0.25em] uppercase border border-prodify-border">Prodify</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-white tracking-tight">Your Workspace</h1>
            <p className="text-sm text-prodify-muted mt-1 font-body">Focus smarter. Track burnout. Stay sharp.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/report"
              className="hidden md:flex items-center gap-2 px-3 py-2 border border-prodify-border bg-prodify-surface hover:bg-prodify-surface-alt text-prodify-muted hover:text-white text-xs font-mono font-medium transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Analytics
            </Link>
            <CreateWorkspaceDialog onCreated={fetchData} variant={workspaces.length === 0 ? "outline" : "primary"} />
          </div>
        </motion.div>

        {/* ── Data Warnings Banner ── */}
        {dataWarnings.length > 0 && (
          <div className="flex items-center justify-between mb-4 bg-zinc-900 border border-zinc-800 p-3 rounded-md">
            <span className="text-sm font-medium text-amber-500">
              Some data couldn't load: {dataWarnings.join(', ')}
            </span>
            <button
              onClick={() => setDataWarnings([])}
              className="text-[#888888] hover:text-white transition-colors text-xs font-bold"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* ── Focus Command Strip ── */}
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-row flex-wrap items-center justify-between gap-4 md:gap-8 bg-zinc-950/80 backdrop-blur-md border border-zinc-800 rounded-xl p-4 mb-10 w-full"
          >
            {/* 1. Today's Focus */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Today's Focus</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {todayLoggedHours}h / {todayTargetHours}h
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {globalSummary ? (
                    `${globalSummary.workspaces_cleared_today} / ${globalSummary.total_active_workspaces} Cleared`
                  ) : 'Daily quota'}
                </span>
              </div>
            </div>

            {/* 2. Momentum */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Momentum</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {momentumScore != null ? `${momentumScore}%` : 'Calibrating'}
                </span>
                <span className={`text-[10px] font-semibold ${getMomentumColor(momentumLabel)}`}>
                  {momentumLabel}
                </span>
              </div>
            </div>

            {/* 3. Deep Work Ratio */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Deep Work Ratio</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {deepWorkRatio}%
                </span>
                <span className="text-[10px] text-zinc-400">
                  {globalSummary?.today_distractions_count != null ? `${globalSummary.today_distractions_count} slips today` : '7d purity'}
                </span>
              </div>
            </div>

            {/* 4. Peak Focus Window */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Peak Focus Window</span>
                <span className="font-mono font-bold text-xs sm:text-sm tracking-tight text-zinc-200">
                  {peakWindow}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {peakSubtitle}
                </span>
              </div>
            </div>

            {/* 5. Global Streak */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-orange-500/10 border border-orange-500/20 rounded-xl">
                <Flame className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Global Streak</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {currentStreak} Day{currentStreak !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] text-orange-400">
                  Best: {longestStreak}d
                </span>
              </div>
            </div>
          </motion.div>

        {/* ── Main Grid: Workspaces + Sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="workspaces">

          {/* Workspaces */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'all' ? 'text-white' : 'text-prodify-muted hover:text-white'}`}
                >
                  All ({workspaces.length})
                </button>
                <button
                  onClick={() => setActiveTab('casual')}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 ${activeTab === 'casual' ? 'text-amber-400' : 'text-prodify-muted hover:text-white'}`}
                >
                  <Zap className="w-3.5 h-3.5" /> Quick Work ({casualCount})
                </button>
                <button
                  onClick={() => setActiveTab('mastery')}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 ${activeTab === 'mastery' ? 'text-[#8b5cf6]' : 'text-prodify-muted hover:text-white'}`}
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Mastery ({masteryCount})
                </button>
                <button
                  onClick={() => setActiveTab('sprint')}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 ${activeTab === 'sprint' ? 'text-blue-500' : 'text-prodify-muted hover:text-white'}`}
                >
                  <Target className="w-3.5 h-3.5" /> Sprints ({sprintCount})
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="border border-prodify-border bg-prodify-surface p-5 animate-pulse">
                    <div className="w-10 h-10 bg-prodify-surface-alt mb-4" />
                    <div className="h-4 bg-prodify-surface-alt w-2/3 mb-2" />
                    <div className="h-3 bg-prodify-surface-alt w-1/3" />
                  </div>
                ))}
              </div>
            ) : filteredWorkspaces.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 border border-dashed border-prodify-border flex flex-col items-center justify-center"
              >
                <Layers className="w-10 h-10 text-prodify-muted/30 mx-auto mb-4" />
                <p className="text-[#666666] text-sm mb-6">No workspaces found.</p>
                {activeTab === 'all' && <CreateWorkspaceDialog onCreated={fetchData} />}
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      totalMinutesLogged={wsSessionMinutes}
                      matrixItem={matrixByWsId[ws.id]}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar: Activity */}
          <div className="lg:col-span-1 space-y-4">
            <RecentActivity sessions={sessions} workspaces={workspaces} />
          </div>

        </div>
      </div>
    </>
  );
};

export default HomePage;
