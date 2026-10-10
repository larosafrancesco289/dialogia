// Module: tutor/lib/topicStatus
// Responsibility: How a plan topic's standing is put into words and numbers, the
// same in the Learning Hub and in memory's Learning folder.

import type { LearningPlanNode, TopicMastery } from '@/lib/types';
import { formatList } from '@/lib/i18n/format';
import { t } from '@/modules/tutor/i18n';
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

/**
 * `waiting` leaves out the topic just before, which goes without saying. A
 * topic closed before it was shown ("skipped": the learner moved on) is left
 * for now: "Done" would claim what they never showed, and "Skipped" read to
 * learners who had worked it as if they had not.
 */
export function statusWords(
  state: StepState,
  upNext: boolean,
  waiting: string[],
  how?: LearningPlanNode['completedHow'],
): string {
  if (state === 'done') return t(how === 'skipped' ? 'status.skipped' : 'status.done');
  if (state === 'current') return t('status.inProgress');
  if (state === 'locked' && waiting.length) {
    return t('status.startsAfter', {
      topics: formatList(waiting.map((name) => t('status.quoted', { name }))),
    });
  }
  return t(upNext ? 'status.upNext' : 'status.notStarted');
}
