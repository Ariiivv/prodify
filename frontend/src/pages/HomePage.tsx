import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layers, BarChart3 } from 'lucide-react';
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

const HomePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'sprint' | 'mastery'>('all');
  const [dataWarnings, setDataWarnings] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<(Workspace & { category?: string })[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [goalPlans, setGoalPlans] = useState<Record<number, GoalPlan>>({});
  const [globalStats, setGlobalStats] = useState<{current_global_streak: number, longest_global_streak: number, ten_day_rolling_score: number} | null>(null);

  const fetchData = useCallback(async () => {
    try {
      let headers = getAuthHeaders();
      // If token isn't ready for some reason, wait a beat
      if (!headers.Authorization) {
        await new Promise(r => setTimeout(r, 500));
        headers = getAuthHeaders();
      }

      const wsRes = await fetch(`${API_BASE}/workspaces`, { 
        headers,
        cache: 'no-store'
      });

      // Fetch global analytics stats
      const statsRes = await fetch(`${API_BASE}/api/analytics/global`, { headers, cache: 'no-store' }).catch(() => {
        setDataWarnings(prev => Array.from(new Set([...prev, "Analytics unavailable"])));
        return null;
      });
      if (statsRes && statsRes.ok) {
        setGlobalStats(await statsRes.json());
      }


      if (wsRes.ok) {
        const wsData: Workspace[] = await wsRes.json();
        setWorkspaces(wsData);
        setIsLoading(false); // Unblock UI immediately so workspaces appear

        // Fetch Goal Optimizer plans for sprint workspaces with targets
        const goalWorkspaces = wsData.filter(
          ws => ws.category === 'sprint' && ws.target_hours && ws.target_hours > 0 && ws.deadline
        );
        const plans: Record<number, GoalPlan> = {};
        await Promise.all(
          goalWorkspaces.map(async ws => {
            try {
              const planRes = await fetch(
                `${API_BASE}/api/goal-optimizer/plan?target_hours=${ws.target_hours}&deadline=${ws.deadline}&workspace_name=${encodeURIComponent(ws.name)}`,
                { headers: getAuthHeaders() }
              );
              if (planRes.ok) {
                plans[ws.id] = await planRes.json();
              }
            } catch {
              // Goal optimizer not available - skip silently
              setDataWarnings(prev => Array.from(new Set([...prev, "Goal optimizer unavailable"])));
            }
          })
        );
        setGoalPlans(plans);
      } else {
        console.error("Failed to fetch workspaces:", wsRes.status, await wsRes.text());
        setIsLoading(false);
      }

      // Fetch recent sessions
      const sessListRes = await fetch(`${API_BASE}/api/telemetry/sessions?limit=100`, { headers: getAuthHeaders(), cache: 'no-store' }).catch(() => {
        setDataWarnings(prev => Array.from(new Set([...prev, "Recent sessions unavailable"])));
        return null;
      });
      if (sessListRes && sessListRes.ok) {
        const sessData: Session[] = await sessListRes.json();
        setSessions(sessData);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
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
  const dailyTargetHours = 4; // Default target

  const avgBurnout = todaySessions.length > 0
    ? Math.round(todaySessions.reduce((s, r) => s + (r.burnout_score || 0), 0) / todaySessions.length * 100)
    : 0;
  const stamina = Math.max(0, Math.min(100, 100 - avgBurnout));

  const todayDistractions = todaySessions.reduce((sum, s) => sum + (s.distraction_count || 0), 0);
  
  const alignmentScore = todaySessions.length > 0 
    ? Math.max(0, 100 - (todayDistractions / todaySessions.length * 5)).toFixed(1) 
    : '—';

  const sprintCount = workspaces.filter(ws => ws.category === 'sprint').length;
  const masteryCount = workspaces.filter(ws => ws.category === 'mastery' || !ws.category).length;

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
          <div className="flex items-center justify-between mb-4 bg-[#161616] border border-[#2a2a2a] p-3 rounded-md">
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
          className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-row flex-wrap items-center justify-between gap-4 md:gap-8 bg-[#111111]/80 backdrop-blur-md border border-[#2a2a2a] rounded-none p-4 mb-10 w-full"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl hidden sm:block">⏱️</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Today's Focus</span>
              <span className="text-white font-mono font-bold text-sm sm:text-base">{todayFocusHours}h / {dailyTargetHours}h</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl hidden sm:block">🎯</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Alignment & Form</span>
              <span className="text-white font-mono font-bold text-sm sm:text-base">
                {alignmentScore}% <span className="text-[#888888] text-[10px]">today</span>
                {' · '}
                ⚡ {globalStats ? Math.round(globalStats.ten_day_rolling_score * 100) : 0}% <span className="text-[#888888] text-[10px]">10d</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl hidden sm:block">🔥</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Global Streak</span>
              <span className="text-white font-mono font-bold text-sm sm:text-base">
                {globalStats?.current_global_streak || 0} Day{globalStats?.current_global_streak !== 1 && 's'}
              </span>
              <span className="text-[10px] text-[#e8ff47]">Best: {globalStats?.longest_global_streak || 0}d</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl hidden sm:block">🛡️</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Deflections</span>
              <span className="text-white font-mono font-bold text-sm sm:text-base">{todayDistractions} blocked</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl hidden sm:block">💚</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Cognitive Vitality</span>
              <span className={`font-mono font-bold text-sm sm:text-base ${stamina > 50 ? 'text-[#e8ff47]' : 'text-amber-500'}`}>
                {stamina}% stamina
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── Main Grid: Workspaces + Sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="workspaces">

          {/* Workspaces */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4 border-b border-[#2a2a2a] pb-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'all' ? 'text-[#e8ff47]' : 'text-prodify-muted hover:text-white'}`}
                >
                  All ({workspaces.length})
                </button>
                <button
                  onClick={() => setActiveTab('sprint')}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'sprint' ? 'text-[#e8ff47]' : 'text-prodify-muted hover:text-white'}`}
                >
                  🎯 Sprints ({sprintCount})
                </button>
                <button
                  onClick={() => setActiveTab('mastery')}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'mastery' ? 'text-[#8b5cf6]' : 'text-prodify-muted hover:text-white'}`}
                >
                  📚 Mastery ({masteryCount})
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
                      goalPlan={goalPlans[ws.id]}
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
