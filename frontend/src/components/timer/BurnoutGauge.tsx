import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Heart, AlertTriangle, Shield, Activity } from 'lucide-react';

interface BurnoutGaugeProps {
  burnoutProbability: number;
  currentState: string;
}

export default function BurnoutGauge({ burnoutProbability, currentState }: BurnoutGaugeProps) {
  const progress = Math.min(Math.max(burnoutProbability, 0), 1);
  const vitality = 1 - progress;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const { color, label, icon: StatusIcon, bgColor } = useMemo(() => {
    if (currentState === 'IDLE') return { color: 'hsl(217 33% 30%)', label: 'Ready', icon: Shield, bgColor: 'bg-muted' };
    if (progress <= 0.25) return { color: 'hsl(142 71% 45%)', label: 'Excellent', icon: Heart, bgColor: 'bg-green-500/10' };
    if (progress <= 0.5) return { color: 'hsl(187 72% 48%)', label: 'Good', icon: Activity, bgColor: 'bg-accent/10' };
    if (progress <= 0.7) return { color: 'hsl(38 92% 50%)', label: 'Moderate', icon: Activity, bgColor: 'bg-amber-500/10' };
    if (progress <= 0.85) return { color: 'hsl(25 95% 53%)', label: 'Strained', icon: AlertTriangle, bgColor: 'bg-orange-500/10' };
    return { color: 'hsl(0 84% 60%)', label: 'Critical', icon: AlertTriangle, bgColor: 'bg-destructive/10' };
  }, [progress, currentState]);

  return (
    <motion.div
      className={`rounded-2xl border border-border/50 p-6 ${bgColor} backdrop-blur-sm`}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring' as const, stiffness: 200, damping: 20 }}
    >
      <motion.div
        className="flex items-center justify-between mb-4"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        <div className="flex items-center gap-2">
          <StatusIcon className="w-4 h-4" style={{ color }} />
          <span className="text-sm font-semibold text-foreground">Focus Vitality</span>
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ color, backgroundColor: `${color}20` }}>
          {label}
        </span>
      </motion.div>

      <div className="flex items-center gap-6">
        {/* Circular gauge */}
        <div className="relative flex-shrink-0">
          <svg width="130" height="130" viewBox="0 0 130 130" className="transform -rotate-90">
            <circle cx="65" cy="65" r={radius} fill="none" stroke="hsl(217 33% 14%)" strokeWidth="8" />
            <motion.circle
              cx="65" cy="65" r={radius}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ type: 'spring' as const, stiffness: 120, damping: 18 }}
            />
          </svg>
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, type: 'spring' as const, stiffness: 150, damping: 14 }}
          >
            <span className="text-2xl font-bold text-foreground">{(progress * 100).toFixed(0)}%</span>
            <span className="text-[10px] text-muted-foreground">Load</span>
          </motion.div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Fatigue Risk</span>
              <span className="font-mono font-medium" style={{ color }}>{(progress * 100).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ type: 'spring' as const, stiffness: 100, damping: 20 }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Vitality</span>
              <span className="font-mono font-medium text-green-400">{(vitality * 100).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-green-500"
                initial={{ width: 0 }}
                animate={{ width: `${vitality * 100}%` }}
                transition={{ type: 'spring' as const, stiffness: 100, damping: 20 }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}