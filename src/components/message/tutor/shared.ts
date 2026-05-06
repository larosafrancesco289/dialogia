import { motionTransition } from '@/lib/ui/motion';

export type StepStatus = 'pending' | 'correct' | 'incorrect' | 'answered';

export function safeKey(val: unknown, idx: number, prefix = 'item'): string {
  const s = typeof val === 'string' ? val.trim() : '';
  const base = !s || s === 'null' || s === 'undefined' ? prefix : s;
  return `${base}-${idx}`;
}

export const cardVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: motionTransition.reveal },
  exit: { opacity: 0, y: -4, scale: 0.99, transition: motionTransition.exit },
};

export const contentVariants = {
  hidden: { opacity: 0, x: 8 },
  visible: { opacity: 1, x: 0, transition: motionTransition.standard },
  exit: { opacity: 0, x: -6, transition: motionTransition.exit },
};
