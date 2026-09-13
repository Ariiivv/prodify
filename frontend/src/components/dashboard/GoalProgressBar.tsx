import { motion } from 'framer-motion';
import { Target, Calendar, Clock, TrendingUp } from 'lucide-react';

interface GoalProgressBarProps {
  /** Workspace/goal name (e.g. "English") */
  goalName: string;
  /** Total target hours for the goal */
  targetHours: number;
  /** Hours already completed (from session history) */
  completedHours: number;
  /** Deadline display string (e.g. "July 11th") */
  deadlineDisplay?: string;
  /** Days remaining until deadline */
  daysRemaining?: number;
  /** Recommended sessions per day from Goal Optimizer */
  sessionsPerDay?: number;
  /** Sprint duration in minutes from Goal Optimizer */
  sprintMinutes?: number;
}

export default function GoalProgressBar({
  goalName,
  targetHours,
  completedHours,
  deadlineDisplay,
  daysRemaining,
  sessionsPerDay,
  sprintMinutes,
}: GoalProgressBarProps) {
  const progress = targetHours > 0 ? Math.min(completedHours / targetHours, 1) : 0;
  const pct = Math.round(progress * 100);
  const remainingHours = Math.max(0, targetHours - completedHours);

  // Dynamic color based on progress
  const progressColor = pct >= 80
    ? 'from-emerald-500 to-green-400'
    : pct >= 40
    ? 'from-violet-500 to-cyan-400'
    : 'from-amber-500 to-orange-400';

  const trackGlow = pct >= 80
    ? 'shadow-emerald-500/20'
    : pct >= 40
    ? 'shadow-violet-500/20'
    : 'shadow-amber-500/20';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={`rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl p-5 overflow-hidden shadow-lg ${trackGlow}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Target className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-primary tracking-widest uppercase">Goal Progress</p>
            <p className="text-sm font-bold text-foreground">{goalName}</p>
          </div>
        </div>
        <span className="text-lg font-bold text-foreground font-mono">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 rounded-full bg-white/[0.06] overflow-hidden mb-3">
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${progressColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
        />
        {/* Shimmer */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span className="text-foreground font-semibold">{completedHours.toFixed(1)}h</span>
          <span>/ {targetHours}h</span>
        </span>
        {deadlineDisplay && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {deadlineDisplay}
            {daysRemaining !== undefined && (
              <span className={`font-medium ${daysRemaining <= 2 ? 'text-red-400' : daysRemaining <= 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                ({daysRemaining}d left)
              </span>
            )}
          </span>
        )}
      </div>

      {/* Optimizer recommendation */}
      {sessionsPerDay && sprintMinutes && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/5 border border-violet-500/10"
        >
          <TrendingUp className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            <span className="text-violet-300 font-medium">{sessionsPerDay}×{sprintMinutes}m</span> sessions/day to hit your deadline
          </p>
        </motion.div>
      )}

      {/* Remaining hours callout */}
      <p className="text-[10px] text-muted-foreground mt-2 text-right">
        {remainingHours > 0
          ? `${remainingHours.toFixed(1)}h remaining`
          : '🎉 Goal completed!'}
      </p>
    </motion.div>
  );
}
