import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Heart, AlertTriangle, Shield, Activity, Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

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
    <TooltipProvider delayDuration={300}>
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
            <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              Focus Vitality
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px]">
                  A live estimate of your mental energy this session, based on how long you've been focused and your historical patterns.
                </TooltipContent>
              </Tooltip>
            </span>
          </div>
          <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ color, backgroundColor: `${color}20` }}>
            {label}
          </span>
        </motion.div>

        <div className="flex items-center gap-8">
          {/* Circular gauge - Now representing Vitality (the overarching positive metric) */}
          <div className="relative flex-shrink-0">
            <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(217 33% 14%)" strokeWidth="8" />
              <motion.circle
                cx="60" cy="60" r={radius}
                fill="none"
                stroke={color}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference * (1 - vitality) }}
                transition={{ type: 'spring' as const, stiffness: 120, damping: 18 }}
              />
            </svg>
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25, type: 'spring' as const, stiffness: 150, damping: 14 }}
            >
              <span className="text-3xl font-bold text-foreground tracking-tighter">{(vitality * 100).toFixed(0)}%</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Vitality</span>
            </motion.div>
          </div>

          {/* Stats - Consolidated to just Fatigue Risk since Load was a duplicate */}
          <div className="flex-1 space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground flex items-center gap-1.5 cursor-help hover:text-foreground transition-colors font-medium">
                      Fatigue Risk <Info className="w-3.5 h-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    Your likelihood of burning out and needing a break. Calculated dynamically based on your continuous focus time (scaled to a 45m block) and penalized during afternoon slumps or late nights.
                  </TooltipContent>
                </Tooltip>
                <span className="font-mono font-bold" style={{ color }}>{(progress * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ type: 'spring' as const, stiffness: 100, damping: 20 }}
                />
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              {progress < 0.4 ? "You're in the zone. Keep up the momentum!" : 
               progress < 0.7 ? "You're starting to build up fatigue. Consider wrapping up this task soon." : 
               "High fatigue detected. It's strongly recommended to take a break."}
            </p>
          </div>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}