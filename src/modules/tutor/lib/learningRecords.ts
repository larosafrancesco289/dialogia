// Module: tutor/lib/learningRecords
// Responsibility: A tutor chat as memory's Learning folder shows it: the plan's
// path and the tutor's estimates, read from the chat's own log each time.

import type { Chat, LearningRecord } from '@/lib/types';
import type { TutorState } from '@/modules/tutor/engine/state';
import { nextReadyNode } from '@/modules/tutor/engine';
import { stepState, waitingOn } from '@/modules/tutor/components/learning-panel/PlanPath';
import { isMeasured, pct, statusWords } from '@/modules/tutor/lib/topicStatus';

/** The chat's record, or undefined while it has no approved plan. */
export function learningRecord(chat: Chat, state: TutorState): LearningRecord | undefined {
  const plan = state.plan;
  if (!plan?.nodes.length) return undefined;
  const upNextId = nextReadyNode(plan)?.id;
  return {
    chatId: chat.id,
    goal: plan.goal,
    studiedAt: chat.updatedAt,
    finished: plan.nodes.every((node) => node.status === 'completed'),
    topics: plan.nodes.map((node) => {
      const step = stepState(plan, node);
      const mastery = state.mastery[node.id];
      return {
        name: node.name,
        state: step,
        ...(isMeasured(mastery) && step !== 'locked' ? { percent: pct(mastery.confidence) } : {}),
        status: statusWords(step, node.id === upNextId, waitingOn(plan, node)),
      };
    }),
  };
}
