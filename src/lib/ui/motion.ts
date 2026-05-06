import type { Transition, Variants } from 'framer-motion';

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
} satisfies Record<string, Transition>;

export const motionVariants = {
  fadeLift: {
    hidden: { opacity: 0, y: 8, scale: 0.985 },
    visible: { opacity: 1, y: 0, scale: 1, transition: motionTransition.reveal },
    exit: { opacity: 0, y: -4, scale: 0.99, transition: motionTransition.exit },
  },
  fadeSlideRight: {
    hidden: { opacity: 0, x: 8 },
    visible: { opacity: 1, x: 0, transition: motionTransition.standard },
    exit: { opacity: 0, x: -6, transition: motionTransition.exit },
  },
  panelLeft: {
    hidden: { opacity: 0, x: -18 },
    visible: { opacity: 1, x: 0, transition: motionTransition.layout },
    exit: { opacity: 0, x: -18, transition: motionTransition.exit },
  },
  panelRight: {
    hidden: { opacity: 0, x: 18 },
    visible: { opacity: 1, x: 0, transition: motionTransition.layout },
    exit: { opacity: 0, x: 18, transition: motionTransition.exit },
  },
} satisfies Record<string, Variants>;
