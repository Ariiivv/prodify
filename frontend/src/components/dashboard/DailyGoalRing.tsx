import { motion } from 'framer-motion';
import { Target } from 'lucide-react';

interface DailyGoalRingProps {
  focusMinutes: number;
  targetMinutes?: number;
}

export default function DailyGoalRing({ focusMinutes, targetMinutes = 240 }: DailyGoalRingProps) {
  const progress = Math.min(focusMinutes / targetMinutes, 1);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const pct = Math.round(progress * 100);

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20 flex-shrink-0">
        <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <motion.circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke="url(#goalGrad)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.4, ease: 'easeOut', delay: 0.3 }}
          />
          <defs>
            <linearGradient id="goalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(263,70%,68%)" />
              <stop offset="100%" stopColor="hsl(187,72%,58%)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-foreground">{pct}%</span>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Target className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary tracking-widest uppercase">Daily Goal</span>
        </div>
        <p className="text-foreground font-bold text-lg leading-tight">{(focusMinutes / 60).toFixed(1)}h <span className="text-muted-foreground font-normal text-sm">/ {targetMinutes / 60}h</span></p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {pct >= 100 ? '🎉 Goal crushed!' : `${Math.round((targetMinutes - focusMinutes))}m remaining`}
        </p>
      </div>
    </div>
  );
}