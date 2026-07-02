import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock, AlertCircle, TrendingUp, Flame } from 'lucide-react';
import { API_BASE } from '@/lib/config';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { format } from 'date-fns';
import { useState, useEffect } from 'react';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/50 rounded-xl px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sessRes, wsRes] = await Promise.all([
          fetch(`${API_BASE}/api/telemetry/sessions?limit=200`).catch(() => null),
          fetch(`${API_BASE}/workspaces`).catch(() => null),
        ]);
        if (sessRes && sessRes.ok) {
          const data = await sessRes.json();
          setSessions(data);
        }
        if (wsRes && wsRes.ok) {
          const data = await wsRes.json();
          setWorkspaces(data);
        }
      } catch (err) {
        console.error('Error fetching analytics data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Group sessions by day
  const dailyData = useMemo(() => {
    const byDay: Record<string, any> = {};
    sessions.forEach((s: any) => {
      const day = s.created_date ? format(new Date(s.created_date), 'MMM dd') : 'Unknown';
      if (!byDay[day]) byDay[day] = { day, focus: 0, distractions: 0, sessions: 0, burnout: 0 };
      byDay[day].focus += s.duration_minutes || 0;
      byDay[day].distractions += s.distraction_count || 0;
      byDay[day].sessions += 1;
      byDay[day].burnout += s.burnout_score || 0;
    });
    return Object.values(byDay).map((d: any) => ({
      ...d,
      avgBurnout: d.sessions > 0 ? ((d.burnout / d.sessions) * 100).toFixed(0) : 0,
    })).slice(-14);
  }, [sessions]);

  // Per-workspace data
  const wsData = useMemo(() => {
    const wsMap: Record<string, string> = {};
    workspaces.forEach((ws: any) => { wsMap[ws.id] = ws.name; });
    const byWs: Record<string, any> = {};
    sessions.forEach((s: any) => {
      const name = wsMap[s.workspace_id] || 'Unknown';
      if (!byWs[name]) byWs[name] = { name, minutes: 0 };
      byWs[name].minutes += s.duration_minutes || 0;
    });
    return Object.values(byWs).sort((a: any, b: any) => b.minutes - a.minutes).slice(0, 8);
  }, [sessions, workspaces]);

  const totalFocus = sessions.reduce((s: number, r: any) => s + (r.duration_minutes || 0), 0);
  const totalDistractions = sessions.reduce((s: number, r: any) => s + (r.distraction_count || 0), 0);
  const avgBurnout = sessions.length > 0
    ? (sessions.reduce((s: number, r: any) => s + (r.burnout_score || 0), 0) / sessions.length * 100).toFixed(0)
    : 0;

  const summaryStats = [
    { label: 'Total Focus', value: `${(totalFocus / 60).toFixed(1)}h`, icon: Clock, color: 'text-accent' },
    { label: 'Total Sessions', value: sessions.length, icon: TrendingUp, color: 'text-primary' },
    { label: 'Distractions', value: totalDistractions, icon: AlertCircle, color: 'text-amber-400' },
    { label: 'Avg Burnout', value: `${avgBurnout}%`, icon: Flame, color: 'text-destructive' },
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-5 h-5 text-primary" />
          <span className="text-xs font-semibold text-primary tracking-widest uppercase">Analytics</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Your Focus Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">Track your productivity over time</p>
      </motion.div>

      {/* Summary Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10"
      >
        {summaryStats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
            </div>
            <span className="text-2xl font-bold text-foreground">{value}</span>
          </div>
        ))}
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20 rounded-2xl border border-dashed border-border/50"
        >
          <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Complete focus sessions to see analytics</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Focus Over Time */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-border/50 bg-card/50 p-6"
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Daily Focus Minutes</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 14%)" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="focus" name="Minutes" stroke="hsl(263, 70%, 58%)" fill="url(#focusGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Distractions Over Time */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-border/50 bg-card/50 p-6"
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Daily Distractions</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 14%)" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="distractions" name="Distractions" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={{ fill: 'hsl(38, 92%, 50%)' }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Focus by Workspace */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl border border-border/50 bg-card/50 p-6"
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Focus by Workspace</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={wsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 14%)" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="minutes" name="Minutes" fill="hsl(187, 72%, 48%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Burnout Trend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-border/50 bg-card/50 p-6"
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Avg Burnout Risk %</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="burnoutGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 14%)" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="avgBurnout" name="Burnout %" stroke="hsl(0, 84%, 60%)" fill="url(#burnoutGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      )}
    </div>
  );
}