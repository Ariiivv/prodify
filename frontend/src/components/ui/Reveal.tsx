import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { revealVariants, reducedMotionVariants } from '@/lib/motion';

export interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

/**
 * Section reveal component with whileInView once:true (fade plus 12px rise).
 * Does not repeat on re-scroll. Disables motion if prefers-reduced-motion is active.
 */
export const Reveal: React.FC<RevealProps> = ({
  children,
  delay = 0,
  className = '',
}) => {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return (
      <div className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      variants={prefersReduced ? reducedMotionVariants : revealVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-24px' }}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
