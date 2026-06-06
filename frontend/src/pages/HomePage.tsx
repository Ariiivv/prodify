import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Layers, Timer, TrendingUp, Flame, BarChart3 } from 'lucide-react';
import { API_BASE } from '@/lib/config';

import AnimatedBackground from '@/components/dashboard/AnimatedBackground';
import ScrambleNumber from '@/components/dashboard/ScrambleNumber';
import DailyGoalRing from '@/components/dashboard/DailyGoalRing';
import RecentActivity from '@/components/dashboard/RecentActivity';
import WorkspaceCard from '@/components/workspace/WorkspaceCard';
import CreateWorkspaceDialog from '@/components/workspace/CreateWorkspaceDialog';

interface Workspace {
  id: number;
  name: string;
  mode: string;
}

interface Session {
  id: number;
  workspace_id: number;
  duration_minutes: number;
  distraction_count: number;
  burnout_score?: number;
  created_date?: string;
}

const HomePage: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    try {
      const wsRes = await fetch(`${API_BASE}/workspaces`);

      if (wsRes.ok) {
        const wsData: Workspace[] = await wsRes.json();
        setWorkspaces(wsData);
      }

      // Fetch recent sessions for the activity panel
      const sessListRes = await fetch(`${API_BASE}/api/telemetry/sessions?limit=100`).catch(() => null);
      if (sessListRes && sessListRes.ok) {
        const sessData: Session[] = await sessListRes.json();
        setSessions(sessData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalFocusMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const avgBurnout = sessions.length > 0
    ? Math.round(sessions.reduce((s, r) => s + (r.burnout_score || 0), 0) / sessions.length * 100)
    : 0;

  const stats = [
    { label: 'Workspaces',   value: String(workspaces.length),                   icon: Layers,   color: 'text-violet-400', glow: 'from-violet-500/10' },
    { label: 'Sessions',     value: String(sessions.length),                      icon: Timer,    color: 'text-cyan-400',   glow: 'from-cyan-500/10' },
    { label: 'Focus Hours',  value: (totalFocusMinutes / 60).toFixed(1) + 'h',   icon: TrendingUp,color:'text-green-400', glow: 'from-green-500/10' },
    { label: 'Avg Burnout',  value: avgBurnout + '%',                             icon: Flame,    color: 'text-rose-400',   glow: 'from-rose-500/10' },
  ];

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
  };

  return (
    <>
      <AnimatedBackground />

      <div className="p-6 md:p-10 max-w-6xl mx-auto">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-start justify-between mb-10"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <motion.div
                animate={{ rotate: [0, 15, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 4 }}
              >
                <Sparkles className="w-5 h-5 text-primary" />
              </motion.div>
              <span className="text-xs font-semibold text-primary tracking-[0.2em] uppercase">Prodify</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Your Workspace</h1>
            <p className="text-sm text-muted-foreground mt-1">Focus smarter. Track burnout. Stay sharp.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/analytics"
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] text-muted-foreground hover:text-foreground text-xs font-medium transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Analytics
            </Link>
            <CreateWorkspaceDialog />
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
            className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl p-5 overflow-hidden group lg:col-span-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
            <div className="relative z-10">
              <DailyGoalRing focusMinutes={totalFocusMinutes} targetMinutes={240} />
            </div>
          </motion.div>

          {/* Stat Cards */}
          {stats.map(({ label, value, icon: Icon, color, glow }) => (
            <motion.div
              key={label}
              variants={item}
              whileHover={{ y: -4, transition: { duration: 0.18 } }}
              className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl p-5 overflow-hidden group cursor-default"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${glow} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400 rounded-2xl`} />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04]">
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{label}</span>
                </div>
                <span className="text-2xl md:text-3xl font-bold text-foreground font-mono">
                  <ScrambleNumber value={value} duration={900} />
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Main Grid: Workspaces + Activity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Workspaces */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Workspaces</h2>
              <span className="text-xs text-muted-foreground">{workspaces.length} total</span>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 animate-pulse">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.05] mb-4" />
                    <div className="h-4 bg-white/[0.05] rounded w-2/3 mb-2" />
                    <div className="h-3 bg-white/[0.05] rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : workspaces.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 rounded-2xl border border-dashed border-white/[0.07]"
              >
                <Layers className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-muted-foreground text-sm">No workspaces yet.</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Create your first one to get started.</p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {workspaces.map((ws, i) => (
                  <WorkspaceCard key={ws.id} workspace={ws} index={i} />
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-1 space-y-4">
            <RecentActivity sessions={sessions} workspaces={workspaces} />

            {/* Quick tip card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl p-5"
            >
              <p className="text-xs font-semibold text-muted-foreground tracking-widest uppercase mb-3">Pro Tip</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Work in <span className="text-foreground font-medium">focused sprints</span> of 45–90 min, then take a proper break. Your brain consolidates memory during rest, not during work.
              </p>
            </motion.div>
          </div>

        </div>
      </div>
    </>
  );
};

export default HomePage;