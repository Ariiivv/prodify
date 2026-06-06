import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface TimerRingProps {
  timeRemaining: number;
  totalDuration: number;
  state: string;
}

export default function TimerRing({ timeRemaining, totalDuration, state }: TimerRingProps) {
  const progress = totalDuration > 0 ? 1 - (timeRemaining / totalDuration) : 0;
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const isRunning = state === 'FOCUS_RUNNING' || state === 'BREAK_RUNNING';
  const isBreak = state === 'BREAK_RUNNING' || state === 'BREAK_PAUSED';
  const isPaused = state === 'FOCUS_PAUSED' || state === 'BREAK_PAUSED';
  const isCompleted = state === 'SESSION_COMPLETED';

  const gradientId = isBreak ? 'breakGrad' : 'focusGrad';

  const minutes = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
  const seconds = (timeRemaining % 60).toString().padStart(2, '0');

  const stateLabel = useMemo(() => {
    switch (state) {
      case 'IDLE': return 'Ready to Focus';
      case 'FOCUS_RUNNING': return 'Deep Focus';
      case 'FOCUS_PAUSED': return 'Paused';
      case 'BREAK_RUNNING': return 'Break Time';
      case 'BREAK_PAUSED': return 'Break Paused';
      case 'SESSION_COMPLETED': return 'Complete!';
      default: return '';
    }
  }, [state]);

  return (
    <div className="relative flex items-center justify-center">
      <svg width="280" height="280" viewBox="0 0 280 280" className="transform -rotate-90">
        <defs>
          <linearGradient id="focusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(263 70% 58%)" />
            <stop offset="100%" stopColor="hsl(187 72% 48%)" />
          </linearGradient>
          <linearGradient id="breakGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(142 71% 45%)" />
            <stop offset="100%" stopColor="hsl(187 72% 48%)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background ring */}
        <circle
          cx="140" cy="140" r={radius}
          fill="none"
          stroke="hsl(217 33% 14%)"
          strokeWidth="6"
        />

        {/* Progress ring */}
        <motion.circle
          cx="140" cy="140" r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          filter={isRunning ? "url(#glow)" : undefined}
          style={{ opacity: state === 'IDLE' ? 0.3 : 1 }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={stateLabel}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-xs font-semibold tracking-[0.2em] uppercase mb-2 ${
            isBreak ? 'text-green-400' : isPaused ? 'text-amber-400' : isCompleted ? 'text-accent' : 'text-primary'
          }`}
        >
          {stateLabel}
        </motion.span>

        <span className="text-6xl font-mono font-bold text-foreground tracking-wider">
          {minutes}:{seconds}
        </span>

        {isPaused && (
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-amber-400 mt-3"
          />
        )}

        {isRunning && (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className={`w-2 h-2 rounded-full mt-3 ${isBreak ? 'bg-green-400' : 'bg-primary'}`}
          />
        )}
      </div>
    </div>
  );
}