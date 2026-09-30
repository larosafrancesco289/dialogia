// Module: tutor/lib/topicStatus
// Responsibility: How a plan topic's standing is put into words and numbers, the
// same in the Learning Hub and in memory's Learning folder.

import type { TopicMastery } from '@/lib/types';
import { listNames, type StepState } from '@/modules/tutor/components/learning-panel/PlanPath';

export const pct = (value: number) => Math.round(value * 100);

// Every topic starts at a prior; only evidence makes it a measurement.
export const isMeasured = (m: TopicMastery | undefined): m is TopicMastery =>
  !!m && (m.interactions > 0 || m.evidence.length > 0);

export function statusWords(state: StepState, upNext: boolean, waiting: string[]): string {
  if (state === 'done') return 'Done';
  if (state === 'current') return 'In progress';
  if (state === 'locked') return `Starts after ${listNames(waiting)}`;
  return upNext ? 'Up next' : 'Not started';
}
