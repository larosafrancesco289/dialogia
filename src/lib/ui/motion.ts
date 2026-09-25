import type { Transition } from 'framer-motion';

export const motionEase = {
  outQuart: [0.25, 1, 0.5, 1],
  outQuint: [0.22, 1, 0.36, 1],
  outExpo: [0.16, 1, 0.3, 1],
} as const;

export const motionTransition = {
  instant: { duration: 0.14, ease: motionEase.outQuint },
  quick: { duration: 0.2, ease: motionEase.outQuint },
  standard: { duration: 0.28, ease: motionEase.outQuart },
  reveal: { duration: 0.34, ease: motionEase.outExpo },
  layout: { duration: 0.32, ease: motionEase.outQuint },
  exit: { duration: 0.2, ease: motionEase.outQuart },
  /** A surface that follows the finger (the phone drawer): an overdamped
   *  spring, so it carries the gesture's velocity without overshooting. */
  follow: { type: 'spring', stiffness: 520, damping: 42, mass: 0.55 },
} satisfies Record<string, Transition>;
