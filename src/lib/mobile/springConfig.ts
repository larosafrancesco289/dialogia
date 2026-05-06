import type { Transition } from 'framer-motion';
import { motionTransition, motionVariants } from '@/lib/ui/motion';

/**
 * Motion configurations tuned for product UI: fast, transform-based, no overshoot.
 * The export name is kept for existing mobile callers.
 */
export const springs = {
  snappy: motionTransition.quick as Transition,
  smooth: motionTransition.layout as Transition,
  bouncy: motionTransition.standard as Transition,
  gentle: motionTransition.reveal as Transition,
  responsive: { type: 'spring', stiffness: 520, damping: 42, mass: 0.55 } as Transition,
} as const;

export const cssEasings = {
  snappy: 'cubic-bezier(0.22, 1, 0.36, 1)',
  smooth: 'cubic-bezier(0.25, 1, 0.5, 1)',
  bouncy: 'cubic-bezier(0.22, 1, 0.36, 1)',
  gentle: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export const durations = {
  instant: 120,
  fast: 180,
  normal: 280,
  slow: 340,
  deliberate: 420,
} as const;

export const variants = {
  fadeSlideUp: motionVariants.fadeLift,
  fadeSlideDown: {
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0, transition: motionTransition.standard },
    exit: { opacity: 0, y: 6, transition: motionTransition.exit },
  },
  scalePop: {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1, transition: motionTransition.quick },
    exit: { opacity: 0, scale: 0.99, transition: motionTransition.exit },
  },
  slideFromRight: {
    initial: { x: '100%' },
    animate: { x: 0, transition: motionTransition.layout },
    exit: { x: '100%', transition: motionTransition.exit },
  },
  slideFromBottom: {
    initial: { y: '100%' },
    animate: { y: 0, transition: motionTransition.layout },
    exit: { y: '100%', transition: motionTransition.exit },
  },
  collapseHeader: {
    visible: { y: 0, opacity: 1, transition: motionTransition.standard },
    hidden: { y: -48, opacity: 0, transition: motionTransition.exit },
  },
} as const;
