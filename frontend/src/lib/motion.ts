/**
 * Prodify Motion Presets & Tokens
 * ==============================
 * Design Direction: "Warm Paper, One Lime Highlighter" (inspired by Osmo, Wandr, Awwwards, SPINX)
 * Signature easing: [0.22, 1, 0.36, 1]
 * Respects prefers-reduced-motion across all animation primitives.
 */

import { type Transition, type Variants } from 'framer-motion';

// ── Signature Easing & Durations ──
export const EASE_CUSTOM: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const DURATIONS = {
  fast: 0.25,
  normal: 0.4,
  hero: 0.55,
  slow: 0.7,
} as const;

export const TRANSITION_DEFAULT: Transition = {
  duration: DURATIONS.normal,
  ease: EASE_CUSTOM,
};

export const TRANSITION_SPRING_DRAWER: Transition = {
  type: 'spring',
  damping: 30,
  stiffness: 300,
};

export const TRANSITION_SPRING_POP: Transition = {
  type: 'spring',
  damping: 20,
  stiffness: 400,
};

// ── Fade & Rise Section Reveal Variants (12px rise, once) ──
export const revealVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATIONS.normal,
      ease: EASE_CUSTOM,
    },
  },
};

// ── Hero Headline Word Slide-Up from Mask Variants ──
export const heroHeadlineWordVariants: Variants = {
  hidden: {
    opacity: 0,
    y: '100%',
  },
  visible: {
    opacity: 1,
    y: '0%',
    transition: {
      duration: DURATIONS.hero,
      ease: EASE_CUSTOM,
    },
  },
};

export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.08,
    },
  },
};

// ── Osmo-Style Interactive Card Hover Variants ──
// Lifts 2px and rotates slightly (0.5deg) with subtle press on active
export const cardHoverMotion = {
  whileHover: {
    y: -2,
    rotate: 0.4,
    transition: { duration: 0.2, ease: EASE_CUSTOM },
  },
  whileTap: {
    y: 0,
    rotate: 0,
    scale: 0.99,
    transition: { duration: 0.1 },
  },
};

// ── Subtle Button Press Motion ──
export const buttonPressMotion = {
  whileTap: {
    scale: 0.97,
    transition: { duration: 0.1 },
  },
};

// ── Slide-Over Drawer Motion Variants ──
export const drawerVariants: Variants = {
  hidden: {
    x: '100%',
    opacity: 0.8,
  },
  visible: {
    x: '0%',
    opacity: 1,
    transition: TRANSITION_SPRING_DRAWER,
  },
  exit: {
    x: '100%',
    opacity: 0.8,
    transition: { duration: 0.25, ease: EASE_CUSTOM },
  },
};

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

// ── Reduced Motion Fallback Variants ──
export const reducedMotionVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
};
