import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { heroHeadlineWordVariants, staggerContainerVariants } from '@/lib/motion';

export interface HeroHeadlineProps {
  children: React.ReactNode;
  className?: string;
  size?: 'default' | 'large' | 'compact';
}

/**
 * Osmo-style signature inline-chip Hero Headline.
 * Displays large light-weight headlines with tight tracking and inline chips.
 * Words and chips slide up from an overflow mask, staggered on mount.
 */
export const HeroHeadline: React.FC<HeroHeadlineProps> = ({
  children,
  className = '',
  size = 'default',
}) => {
  const prefersReduced = useReducedMotion();

  const sizeClasses = {
    compact: 'text-2xl sm:text-3xl md:text-4xl leading-tight',
    default: 'text-3xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.02] tracking-tightest',
    large: 'text-4xl sm:text-6xl md:text-7xl lg:text-8xl leading-display tracking-tightest',
  }[size];

  if (prefersReduced) {
    return (
      <h1 className={`font-display font-normal text-zinc-100 ${sizeClasses} ${className}`}>
        {children}
      </h1>
    );
  }

  return (
    <motion.h1
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className={`font-display font-normal text-zinc-100 ${sizeClasses} ${className}`}
    >
      {React.Children.map(children, (child, idx) => {
        // If string, split words so they reveal from a mask
        if (typeof child === 'string') {
          return child.split(' ').map((word, wordIdx) => (
            <span
              key={`${idx}-${wordIdx}`}
              className="inline-block overflow-hidden py-1 pr-[0.25em] align-top"
            >
              <motion.span
                variants={heroHeadlineWordVariants}
                className="inline-block"
              >
                {word}
              </motion.span>
            </span>
          ));
        }

        // For chips or other React nodes, reveal as a masked inline block
        return (
          <span
            key={idx}
            className="inline-block overflow-hidden py-1 pr-[0.25em] align-baseline"
          >
            <motion.span
              variants={heroHeadlineWordVariants}
              className="inline-block"
            >
              {child}
            </motion.span>
          </span>
        );
      })}
    </motion.h1>
  );
};
