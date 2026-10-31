import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Timer, AlertCircle, Flame } from 'lucide-react';

interface RecentActivityProps {
  sessions: any[];
  workspaces: any[];
}

export default function RecentActivity({ sessions, workspaces }: RecentActivityProps) {
  const recentSessions = sessions.slice(0, 5);

  const getWorkspaceName = (wsId?: string | number) => {
    if (wsId === undefined || wsId === null) return 'Unknown Track';
    const ws = workspaces.find((w: any) => String(w.id) === String(wsId));
    return ws?.name || 'Unknown Track';
  };

  const formatSessionTime = (startTimeStr?: string) => {
    if (!startTimeStr) return null;
    try {
      const d = new Date(startTimeStr);
      if (isNaN(d.getTime())) return null;
      const today = new Date();
      const isToday = d.toDateString() === today.toDateString();
      const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (isToday) {
        return `Today at ${timePart}`;
      }
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timePart}`;
    } catch {
      return null;
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl p-5 shadow-sm">
      {recentSessions.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-8 font-mono">
          No focus sessions logged yet. Start a session in any workspace to record live flow telemetry!
        </p>
      ) : (
        <div className="divide-y divide-zinc-800/60">
          {recentSessions.map((session: any, i: number) => {
            const isCompleted = session.completed || session.status === 'COMPLETED';
            const formattedTime = formatSessionTime(session.start_time);
            const distractionCount = session.distraction_count || 0;

            return (
              <motion.div
                key={session.id || i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center justify-between py-3.5 first:pt-1 last:pb-1 group hover:bg-white/[0.015] px-2 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isCompleted ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-amber-500/10 border border-amber-500/20'
                  }`}>
                    {isCompleted ? (
                      <Timer className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white font-mono">
                        {session.duration_minutes || 0}m focus session
                      </span>
                      <span className={`text-[10px] font-mono font-medium px-1.5 py-0.2 rounded border ${
                        isCompleted 
                          ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' 
                          : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                      }`}>
                        {isCompleted ? 'Completed' : 'Partial'}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 mt-0.5">
                      Track: <strong className="text-zinc-200 font-medium">{getWorkspaceName(session.workspace_id)}</strong>
                      {formattedTime && (
                        <span className="text-zinc-500 ml-2 font-mono text-[10px]">
                          • {formattedTime}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {distractionCount > 0 ? (
                    <span className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded font-mono font-medium">
                      {distractionCount} slip{distractionCount === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-[11px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono hidden sm:inline">
                      100% flow
                    </span>
                  )}
                  {session.burnout_score ? (
                    <span className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      {Math.round(session.burnout_score * 100)}% load
                    </span>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
