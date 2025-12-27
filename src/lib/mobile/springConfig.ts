/**
 * Spring physics configuration for mobile animations.
 * Based on iOS-like spring dynamics for a native feel.
 */

import type { Transition } from 'framer-motion';

/**
 * Framer Motion spring configurations
 */
export const springs = {
  /** Quick, snappy response - for buttons, tabs, micro-interactions */
  snappy: {
    type: 'spring',
    stiffness: 400,
    damping: 30,
    mass: 1,
  } as Transition,

  /** Smooth navigation - for sheets, panels, page transitions */
  smooth: {
    type: 'spring',
    stiffness: 300,
    damping: 28,
    mass: 1,
  } as Transition,

  /** Bouncy feedback - for swipe reveal, header collapse, playful elements */
  bouncy: {
    type: 'spring',
    stiffness: 350,
    damping: 22,
    mass: 0.8,
  } as Transition,

  /** Gentle settle - for content appearing, fade-ins */
  gentle: {
    type: 'spring',
    stiffness: 200,
    damping: 25,
    mass: 1,
  } as Transition,

  /** Ultra responsive - for drag following, real-time feedback */
  responsive: {
    type: 'spring',
    stiffness: 500,
    damping: 35,
    mass: 0.5,
  } as Transition,
} as const;

/**
 * CSS cubic-bezier approximations of spring physics
 * Use when Framer Motion isn't available
 */
export const cssEasings = {
  snappy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  smooth: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  bouncy: 'cubic-bezier(0.175, 0.885, 0.32, 1.1)',
  gentle: 'cubic-bezier(0.22, 0.68, 0.0, 1.0)',
} as const;

/**
 * Duration presets for CSS animations
 */
export const durations = {
  instant: 100,
  fast: 150,
  normal: 250,
  slow: 400,
  deliberate: 600,
} as const;

/**
 * Framer Motion variants for common patterns
 */
export const variants = {
  /** Fade and slide up entrance */
  fadeSlideUp: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  },

  /** Fade and slide down entrance */
  fadeSlideDown: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 12 },
  },

  /** Scale pop entrance */
  scalePop: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
  },

  /** Slide from right (for sheets) */
  slideFromRight: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
  },

  /** Slide from bottom (for bottom sheets) */
  slideFromBottom: {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
  },

  /** Collapse/expand for header */
  collapseHeader: {
    visible: { y: 0, opacity: 1 },
    hidden: { y: -60, opacity: 0 },
  },
} as const;
