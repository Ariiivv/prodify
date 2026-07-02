import { motion } from 'framer-motion';
import { Clock, Timer, AlertCircle, Flame } from 'lucide-react';

interface RecentActivityProps {
  sessions: any[];
  workspaces: any[];
}

export default function RecentActivity({ sessions, workspaces }: RecentActivityProps) {
  const recentSessions = sessions.slice(0, 5);

  const getWorkspaceName = (wsId?: string | number) => {
    if (wsId === undefined || wsId === null) return 'Unknown';
    const ws = workspaces.find((w: any) => String(w.id) === String(wsId));
    return ws?.name || 'Unknown';
  };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
      </div>

      {recentSessions.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No sessions yet. Start your first focus session!</p>
      ) : (
        <div className="space-y-3">
          {recentSessions.map((session: any, i: number) => (
            <motion.div
              key={session.id || i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  session.completed ? 'bg-green-500/10' : 'bg-amber-500/10'
                }`}>
                  {session.completed ? (
                    <Timer className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {session.duration_minutes || 0}m session
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {getWorkspaceName(session.workspace_id)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {session.distraction_count ? (
                  <span className="text-[10px] text-muted-foreground">
                    {session.distraction_count}×
                  </span>
                ) : null}
                {session.burnout_score ? (
                  <span className="flex items-center gap-1 text-[10px] text-rose-400">
                    <Flame className="w-3 h-3" />
                    {Math.round(session.burnout_score * 100)}%
                  </span>
                ) : null}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}