import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Layers, Timer, TrendingUp, Flame, BarChart3 } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useAuthStore } from '@/store/authStore';

import AnimatedBackground from '@/components/dashboard/AnimatedBackground';
import ScrambleNumber from '@/components/dashboard/ScrambleNumber';
import DailyGoalRing from '@/components/dashboard/DailyGoalRing';
import RecentActivity from '@/components/dashboard/RecentActivity';
import GoalProgressBar from '@/components/dashboard/GoalProgressBar';
import WorkspaceCard from '@/components/workspace/WorkspaceCard';
import CreateWorkspaceDialog from '@/components/workspace/CreateWorkspaceDialog';

interface Workspace {
  id: number;
  name: string;
  mode: string;
  target_hours?: number;
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [goalPlans, setGoalPlans] = useState<Record<number, GoalPlan>>({});
  const [peakDistractionHour, setPeakDistractionHour] = useState<number | undefined>(undefined);

  const fetchData = useCallback(async () => {
    try {
      let headers = getAuthHeaders();
      // If token isn't ready for some reason, wait a beat
      if (!headers.Authorization) {
        await new Promise(r => setTimeout(r, 500));
        headers = getAuthHeaders();
      }

      const wsRes = await fetch(`${API_BASE}/workspaces`, { headers });

      if (wsRes.ok) {
        const wsData: Workspace[] = await wsRes.json();
        setWorkspaces(wsData);
        setIsLoading(false); // Unblock UI immediately so workspaces appear

        // Fetch Goal Optimizer plans for structured workspaces with targets
        const goalWorkspaces = wsData.filter(
          ws => ws.target_hours && ws.target_hours > 0 && ws.deadline
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
            }
          })
        );
        setGoalPlans(plans);
      } else {
        console.error("Failed to fetch workspaces:", wsRes.status, await wsRes.text());
        setIsLoading(false);
      }

      // Fetch recent sessions
      const sessListRes = await fetch(`${API_BASE}/api/telemetry/sessions?limit=100`, { headers: getAuthHeaders() }).catch(() => null);
      if (sessListRes && sessListRes.ok) {
        const sessData: Session[] = await sessListRes.json();
        setSessions(sessData);
      }

      // Fetch coach insights to extract peak distraction hour
      try {
        const insightsRes = await fetch(`${API_BASE}/api/ai-coach/chat`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            message: '__internal_peak_hour_query',
            context: { workspaceName: 'Dashboard' },
          }),
        });
        // We don't actually need the response — the backend's tool will expose
        // the peak hour via the distraction data tool. For now, approximate from
        // the current hour.
      } catch {
        // Non-critical
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

  // Detect the peak distraction hour from session patterns (client-side heuristic)
  useEffect(() => {
    if (sessions.length < 3) return;
    const hourCounts: Record<number, number> = {};
    sessions.forEach(s => {
      if (s.distraction_count > 0 && s.created_date) {
        try {
          const hour = new Date(s.created_date).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + s.distraction_count;
        } catch { /* skip invalid dates */ }
      }
    });
    const sorted = Object.entries(hourCounts).sort(([, a], [, b]) => b - a);
    if (sorted.length > 0) {
      setPeakDistractionHour(parseInt(sorted[0][0]));
    }
  }, [sessions]);

  const handleDeleted = useCallback((workspaceId: number) => {
    setWorkspaces(prev => prev.filter(ws => ws.id !== workspaceId));
  }, []);

  const totalFocusMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const avgBurnout = sessions.length > 0
    ? Math.round(sessions.reduce((s, r) => s + (r.burnout_score || 0), 0) / sessions.length * 100)
    : 0;

  // Calculate today's focus minutes for the Daily Goal ring
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter(s => s.created_date && s.created_date.startsWith(today));
  const dailyFocusMinutes = todaySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  // Check if ANY workspace has a goal plan for the hero section
  const goalWorkspaces = workspaces.filter(ws => goalPlans[ws.id]);

  const stats = [
    { label: 'Workspaces',   value: String(workspaces.length),                   icon: Layers,    accent: true },
    { label: 'Sessions',     value: String(sessions.length),                      icon: Timer,     accent: false },
    { label: 'Focus Hours',  value: (totalFocusMinutes / 60).toFixed(1) + 'h',   icon: TrendingUp,accent: false },
    { label: 'Avg Burnout',  value: avgBurnout + '%',                             icon: Flame,     accent: false },
  ];

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
  };

  const currentHour = new Date().getHours();

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

        {/* ── Hero Row: Goal Ring + Stats ── */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
        >
          {/* Daily Goal Card */}
          <motion.div
            variants={item}
            className="relative border border-prodify-border bg-prodify-surface p-5 overflow-hidden group lg:col-span-1"
          >
            <div className="relative z-10">
              <DailyGoalRing focusMinutes={dailyFocusMinutes} targetMinutes={240} />
            </div>
          </motion.div>

          {/* Stat Cards */}
          {stats.map(({ label, value, icon: Icon, accent }) => (
            <motion.div
              key={label}
              variants={item}
              whileHover={{ y: -2, transition: { duration: 0.15 } }}
              className="relative border border-prodify-border bg-prodify-surface p-5 overflow-hidden group cursor-default"
            >
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-prodify-surface-alt border border-prodify-border">
                    <Icon className="w-4 h-4 text-prodify-muted" />
                  </div>
                  <span className="text-xs text-prodify-muted font-mono uppercase tracking-wider">{label}</span>
                </div>
                <span className="text-3xl md:text-4xl font-bold text-white font-mono tracking-tight">
                  <ScrambleNumber value={value} duration={900} />
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Goal Progress Bars (for workspaces with targets + deadlines) ── */}
        {goalWorkspaces.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-4 mb-8"
          >
            <h2 className="text-base font-heading font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-prodify-muted" />
              Active Goal Plans
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goalWorkspaces.map(ws => {
                const plan = goalPlans[ws.id];
                // Calculate completed hours for this specific workspace
                const wsSessionMinutes = sessions
                  .filter(s => s.workspace_id === ws.id)
                  .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
                return (
                  <GoalProgressBar
                    key={ws.id}
                    goalName={ws.name}
                    targetHours={plan.target_hours}
                    completedHours={wsSessionMinutes / 60}
                    deadlineDisplay={plan.deadline_display}
                    daysRemaining={plan.days_remaining}
                    sessionsPerDay={plan.sessions_per_day}
                    sprintMinutes={plan.historical_sprint_minutes}
                  />
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Main Grid: Workspaces + Sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="workspaces">

          {/* Workspaces */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-heading font-semibold text-white">Workspaces</h2>
              <span className="text-xs text-prodify-muted font-mono">{workspaces.length} total</span>
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
            ) : workspaces.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 border border-dashed border-prodify-border flex flex-col items-center justify-center"
              >
                <Layers className="w-10 h-10 text-prodify-muted/30 mx-auto mb-4" />
                <p className="text-[#666666] text-sm mb-6">No workspaces yet. Create one to start tracking your focus.</p>
                <CreateWorkspaceDialog onCreated={fetchData} />
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {workspaces.map((ws, i) => (
                  <WorkspaceCard key={ws.id} workspace={ws} index={i} onDeleted={handleDeleted} />
                ))}
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
