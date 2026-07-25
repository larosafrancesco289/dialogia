import type { MessageTutor } from '@/lib/types';
import { buildTutorContextFull } from '@/modules/tutor/lib/contextFull';
import { buildTutorContextSummary } from '@/modules/tutor/lib/contextSummary';

const tutorContextCache = new WeakMap<MessageTutor, { summary?: string; full?: string }>();

export { buildTutorContextFull, buildTutorContextSummary };

export function getTutorContext(tutor: MessageTutor | undefined): {
  summary?: string;
  full?: string;
} {
  if (!tutor || typeof tutor !== 'object') return {};
  const cached = tutorContextCache.get(tutor);
  if (cached) return cached;
  const summary = buildTutorContextSummary(tutor);
  const full = buildTutorContextFull(tutor);
  const snapshot = { summary, full };
  tutorContextCache.set(tutor, snapshot);
  return snapshot;
}
