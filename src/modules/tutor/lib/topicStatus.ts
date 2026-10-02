// Module: tutor/lib/topicStatus
// Responsibility: How a plan topic's standing is put into words and numbers, the
// same in the Learning Hub and in memory's Learning folder.

import type { TopicMastery } from '@/lib/types';
import { listInProse } from '@/lib/utils/text';
import type { StepState } from '@/modules/tutor/components/learning-panel/PlanPath';
import { isMeasured } from '@/modules/tutor/engine';

export const pct = (value: number) => Math.round(value * 100);

/**
 * The percentage a topic shows, if any: every started topic from its first moment
 * (so the first change moves a number already seen), and any other with evidence.
 * Never a locked one, whose number would say more than the tutor knows.
 */
export function shownPercent(state: StepState, mastery: TopicMastery | undefined) {
  if (!mastery || state === 'locked') return undefined;
  const started = state === 'current' || state === 'done';
  return started || isMeasured(mastery) ? pct(mastery.confidence) : undefined;
}

/** `waiting` leaves out the topic just before, which goes without saying. */
export function statusWords(state: StepState, upNext: boolean, waiting: string[]): string {
  if (state === 'done') return 'Done';
  if (state === 'current') return 'In progress';
  if (state === 'locked' && waiting.length) {
    return `Starts after ${listInProse(waiting.map((name) => `“${name}”`))}`;
  }
  return upNext ? 'Up next' : 'Not started';
}
