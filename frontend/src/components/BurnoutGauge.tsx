import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTimerStore } from '../store/timerStore';

interface BurnoutGaugeProps {
  onProbabilityChange?: (probability: number) => void;
  focusMinutes?: number;
}

const BurnoutGauge: React.FC<BurnoutGaugeProps> = ({ onProbabilityChange, focusMinutes: propFocusMinutes }) => {
  const { timeRemaining, currentState } = useTimerStore((state: any) => state);
  const [burnoutProbability, setBurnoutProbability] = useState<number>(0);
  const [currentHour, setCurrentHour] = useState<number>(new Date().getHours());

  // Store callback in a ref so it doesn't trigger effect re-runs
  const onProbabilityChangeRef = useRef(onProbabilityChange);
  onProbabilityChangeRef.current = onProbabilityChange;

  const totalSessionMinutes = 25;
  const remainingMinutes = timeRemaining / 60;
  const rawFocusMinutes = propFocusMinutes !== undefined
    ? propFocusMinutes
    : (currentState === 'IDLE' || currentState === 'SESSION_COMPLETED'
      ? 0
      : Math.max(0, Math.floor(totalSessionMinutes - remainingMinutes)));

  // Baseline focusMinutes to 1 at the very start of a session to avoid ML edge case
  const focusMinutes = rawFocusMinutes === 0 && (currentState === 'FOCUS_RUNNING' || currentState === 'FOCUS_PAUSED')
    ? 1
    : rawFocusMinutes;

  // Stable callback that reads from the ref
  const notifyParent = useCallback((prob: number) => {
    onProbabilityChangeRef.current?.(prob);
  }, []);

  useEffect(() => {
    if (currentState === 'IDLE') {
      setBurnoutProbability(0);
      notifyParent(0);
      return;
    }

    const fetchBurnoutPrediction = async () => {
      try {
        const response = await fetch(
          `http://127.0.0.1:8000/api/ml/burnout-prediction?current_hour=${currentHour}&current_focus_minutes=${focusMinutes}`
        );
        if (!response.ok) throw new Error('Failed to fetch ML data');
        const data = await response.json();
        const probability = data.tab_switch_probability ?? 0;
        setBurnoutProbability(probability);
        notifyParent(probability);
      } catch (error) {
        console.error("ML API Error:", error);
        // Fallback: compute a simple linear estimate based on elapsed minutes
        const elapsed = Math.max(0, focusMinutes);
        const estimated = Math.min(elapsed / totalSessionMinutes, 0.95);
        setBurnoutProbability(estimated);
        notifyParent(estimated);
      }
    };

    // Fetch immediately, then poll every 60 seconds
    fetchBurnoutPrediction();
    const fetchId = setInterval(fetchBurnoutPrediction, 60000);

    // Hour updater every 60s
    const hourId = setInterval(() => {
      const hourNow = new Date().getHours();
      if (hourNow !== currentHour) setCurrentHour(hourNow);
    }, 60000);

    return () => {
      clearInterval(fetchId);
      clearInterval(hourId);
    };
  }, [focusMinutes, currentState, currentHour, notifyParent, totalSessionMinutes]);

  // --- Circular progress ring colors ---
  const progress = Math.min(Math.max(burnoutProbability, 0), 1);

  const ringColor = useMemo(() => {
    if (progress <= 0.3) return { stroke: '#22c55e', gradient: 'url(#greenGrad)' };    // green-500
    if (progress <= 0.5) return { stroke: '#06b6d4', gradient: 'url(#cyanGrad)' };    // cyan-500
    if (progress <= 0.65) return { stroke: '#3b82f6', gradient: 'url(#blueGrad)' };   // blue-500
    if (progress <= 0.8) return { stroke: '#f59e0b', gradient: 'url(#amberGrad)' };   // amber-500
    return { stroke: '#ef4444', gradient: 'url(#redGrad)' };                           // red-500
  }, [progress]);

  const circumference = 2 * Math.PI * 54; // r=54
  const strokeDashoffset = circumference * (1 - progress);

  const statusLabel = useMemo(() => {
    if (currentState === 'IDLE') return 'Ready';
    if (progress <= 0.2) return 'Excellent';
    if (progress <= 0.4) return 'Great';
    if (progress <= 0.6) return 'Moderate';
    if (progress <= 0.8) return 'Strained';
    return 'Critical';
  }, [progress, currentState]);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-2xl shadow-xl border border-slate-800/50 w-full transition-all duration-300 hover:shadow-2xl hover:border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white tracking-tight">
          Focus Vitality
        </h2>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          currentState === 'IDLE'
            ? 'bg-slate-700 text-slate-400'
            : progress <= 0.4
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : progress <= 0.7
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
        }`}>
          {statusLabel}
        </span>
      </div>

      {/* Circular Progress Ring */}
      <div className="flex flex-col items-center mb-4">
        <div className="relative w-36 h-36">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
              <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="amberGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
              <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            {/* Background ring */}
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke="#1e293b"
              strokeWidth="8"
              className="opacity-50"
            />
            {/* Progress ring */}
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke={ringColor.stroke}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {(progress * 100).toFixed(0)}%
            </span>
            <span className="text-[10px] font-medium text-slate-500 mt-0.5 uppercase tracking-wider">
              {currentState === 'IDLE' ? 'Idle' : 'Load'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-center gap-3 text-xs text-slate-500 mt-2">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${
            progress <= 0.3 ? 'bg-green-500' : progress <= 0.5 ? 'bg-cyan-500' : progress <= 0.65 ? 'bg-blue-500' : 'bg-slate-600'
          }`} />
          <span>Healthy</span>
        </div>
        <div className="w-px h-3 bg-slate-800" />
        <span className="text-slate-600">{focusMinutes}m elapsed</span>
        <div className="w-px h-3 bg-slate-800" />
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${progress > 0.8 ? 'bg-red-500' : progress > 0.65 ? 'bg-amber-500' : 'bg-slate-600'}`} />
          <span>Fatigued</span>
        </div>
      </div>

      {currentState === 'IDLE' && (
        <p className="text-center text-slate-500 text-sm mt-4">Start a focus session to begin tracking.</p>
      )}
    </div>
  );
};

export default BurnoutGauge;
