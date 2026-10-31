import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Animated number counter that ticks up from 0 to target on first mount.
 * Automatically disables animation if user prefers reduced motion.
 */
export const CountUp: React.FC<CountUpProps> = ({
  to,
  from = 0,
  duration = 1000,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}) => {
  const prefersReduced = useReducedMotion();
  const [value, setValue] = useState(prefersReduced ? to : from);

  useEffect(() => {
    if (prefersReduced) {
      setValue(to);
      return;
    }

    const startTime = performance.now();
    const diff = to - from;

    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Easing: cubic-bezier(0.22, 1, 0.36, 1) approximation: 1 - Math.pow(1 - progress, 3)
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + diff * eased;

      setValue(current);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setValue(to);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [to, from, duration, prefersReduced]);

  const formatted = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();

  return (
    <span className={`tabular-nums font-mono ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};
