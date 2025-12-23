export type StepStatus = 'pending' | 'correct' | 'incorrect' | 'answered';

export function safeKey(val: unknown, idx: number, prefix = 'item'): string {
  const s = typeof val === 'string' ? val.trim() : '';
  const base = !s || s === 'null' || s === 'undefined' ? prefix : s;
  return `${base}-${idx}`;
}

export const cardVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.2 } },
};

export const contentVariants = {
  hidden: { opacity: 0, x: 10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: -10, transition: { duration: 0.2 } },
};
