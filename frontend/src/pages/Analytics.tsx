import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock, AlertCircle, TrendingUp, Flame } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { format } from 'date-fns';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

const focusChartConfig = {
  focus: {
    label: 'Focus Minutes',
    color: 'hsl(263, 70%, 58%)',
  },
};

const wsChartConfig = {
  minutes: {
    label: 'Focus Minutes',
    color: 'hsl(187, 72%, 48%)',
  },
};

const appsChartConfig = {
  count: {
    label: 'Distraction Events',
    color: 'hsl(340, 70%, 50%)',
  },
};

export default function Analytics() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [distractingApps, setDistractingApps] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sessRes, wsRes, appsRes] = await Promise.all([
          fetch(`${API_BASE}/api/telemetry/sessions?limit=200`, { headers: getAuthHeaders(), cache: 'no-store' }).catch(() => null),
          fetch(`${API_BASE}/workspaces`, { headers: getAuthHeaders(), cache: 'no-store' }).catch(() => null),
          fetch(`${API_BASE}/api/analytics/distracting-apps`, { headers: getAuthHeaders(), cache: 'no-store' }).catch(() => null),
        ]);
        if (sessRes && sessRes.ok) {
          const data = await sessRes.json();
          setSessions(data);
        }
        if (wsRes && wsRes.ok) {
          const data = await wsRes.json();
          setWorkspaces(data);
        }
        if (appsRes && appsRes.ok) {
          const data = await appsRes.json();
          setDistractingApps(data);
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
      if (!byDay[day]) byDay[day] = { day, focus: 0 };
      byDay[day].focus += s.duration_minutes || 0;
    });
    return Object.values(byDay).slice(-14);
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
    { label: 'Total Focus Hours', value: `${(totalFocus / 60).toFixed(1)}h`, icon: Clock, color: 'text-accent' },
    { label: 'Total Sessions', value: sessions.length, icon: TrendingUp, color: 'text-primary' },
    { label: 'Total Distractions', value: totalDistractions, icon: AlertCircle, color: 'text-amber-400' },
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
          <p className="text-muted-foreground text-sm">Complete focus sessions to see your analytics</p>
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
            <h3 className="text-sm font-semibold text-foreground mb-4">Focus Minutes per Day</h3>
            <ChartContainer config={focusChartConfig} className="h-[220px] w-full">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 14%)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="focus" name="Focus Minutes" stroke="var(--color-focus)" strokeWidth={2} dot={{ fill: 'var(--color-focus)' }} />
              </LineChart>
            </ChartContainer>
          </motion.div>

          {/* Focus by Workspace */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl border border-border/50 bg-card/50 p-6"
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Focus Minutes per Workspace</h3>
            <ChartContainer config={wsChartConfig} className="h-[220px] w-full">
              <BarChart data={wsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 14%)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="minutes" name="Focus Minutes" fill="var(--color-minutes)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </motion.div>

          {/* Top Distracting Apps */}
          {distractingApps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-2xl border border-border/50 bg-card/50 p-6 lg:col-span-2 xl:col-span-1"
            >
              <h3 className="text-sm font-semibold text-foreground mb-4">Top Distracting Apps</h3>
              <ChartContainer config={appsChartConfig} className="h-[220px] w-full">
                <BarChart data={distractingApps} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 14%)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" name="Distraction Events" fill="var(--color-count)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ChartContainer>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
