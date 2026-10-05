import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layers, BarChart3, Activity, Brain, Clock, Target, Flame, Zap, TrendingUp } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useAuthStore } from '@/store/authStore';

import AnimatedBackground from '@/components/dashboard/AnimatedBackground';
import RecentActivity from '@/components/dashboard/RecentActivity';
import WorkspaceCard from '@/components/workspace/WorkspaceCard';
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

  const fetchData = useCallback(async () => {
    try {
      let headers = getAuthHeaders();
      // If token isn't ready for some reason, wait a beat
      if (!headers.Authorization) {
        await new Promise(r => setTimeout(r, 500));
        headers = getAuthHeaders();
      }

      const [resAgg, resMetrics, resSessions] = await Promise.all([
        fetch(`${API_BASE}/workspaces`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/api/metrics/home`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/api/telemetry/sessions?limit=100`, { headers, cache: 'no-store' })
      ]);

      const warnings = [];

      if (resAgg.ok) {
        const data = await resAgg.json();
        setWorkspaces(data);
      } else {
        warnings.push("Workspaces");
      }

      if (resMetrics.ok) {
        setHomeMetrics(await resMetrics.json());
      } else {
        warnings.push("Metrics");
      }

      if (resSessions.ok) {
        setSessions(await resSessions.json());
      } else {
        warnings.push("Sessions");
      }

      if (warnings.length > 0) {
        setDataWarnings(prev => Array.from(new Set([...prev, `Failed to load: ${warnings.join(', ')}`])));
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

  // Compute metrics for Focus Command Strip
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter(s => s.created_date && s.created_date.startsWith(today));
  const dailyFocusMinutes = todaySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const todayFocusHours = (dailyFocusMinutes / 60).toFixed(1);
  const dailyTargetMinutes = workspaces.reduce((sum, ws) => sum + (ws.daily_target_minutes || 0), 0);
    const targetDisplay = dailyTargetMinutes > 0 ? ` / ${(dailyTargetMinutes / 60).toFixed(1)}h` : '';

  
  
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
              to="/analytics"
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
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Today's Focus</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">{todayFocusHours}h{targetDisplay}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Momentum</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {homeMetrics?.momentum?.score != null ? `${Math.round(homeMetrics.momentum.score)}%` : '0%'}
                  <span className="text-[#888888] text-[10px] ml-1">7d</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Deep Work</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {homeMetrics?.deep_work_ratio_aggregate != null ? `${homeMetrics.deep_work_ratio_aggregate}%` : '-'}
                  <span className="text-[#888888] text-[10px] ml-1">7d</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Peak Window</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {homeMetrics?.peak_focus_window && !('insufficient_data' in homeMetrics.peak_focus_window) 
                    ? (homeMetrics.peak_focus_window as any).peak_range 
                    : 'Learning...'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 items-center justify-center bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Flame className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Global Streak</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {homeMetrics?.current_streak || 0} Day{homeMetrics?.current_streak !== 1 && 's'}
                </span>
                <span className="text-[10px] text-blue-500">Best: {homeMetrics?.longest_streak || 0}d</span>
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
