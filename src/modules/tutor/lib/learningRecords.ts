// Module: tutor/lib/learningRecords
// Responsibility: A tutor chat as memory's Learning folder shows it: the plan's
// path and the tutor's estimates, read from the chat's own log each time.

import type { Chat, LearningRecord } from '@/lib/types';
import type { TutorState } from '@/modules/tutor/engine/state';
import type { TutorSession } from '@/modules/tutor/store/tutorSlice';
import { isSharedTutorChat } from '@/modules/tutor/store/selectors';
import { nextReadyNode } from '@/modules/tutor/engine';
import { stepState, waitingOn } from '@/modules/tutor/components/learning-panel/PlanPath';
import { shownPercent, statusWords } from '@/modules/tutor/lib/topicStatus';

/** The chat's record, or undefined while it has no approved plan. */
export function learningRecord(chat: Chat, state: TutorState): LearningRecord | undefined {
  const plan = state.plan;
  if (!plan?.nodes.length) return undefined;
  const upNextId = nextReadyNode(plan)?.id;
  return {
    chatId: chat.id,
    goal: plan.goal,
    ...(plan.subject ? { subject: plan.subject } : {}),
    studiedAt: chat.updatedAt,
    finished: plan.nodes.every((node) => node.status === 'completed'),
    topics: plan.nodes.map((node) => {
      const step = stepState(plan, node);
      const percent = shownPercent(step, state.mastery[node.id]);
      return {
        name: node.name,
        state: step,
        ...(percent != null ? { percent } : {}),
        status: statusWords(step, node.id === upNextId, waitingOn(plan, node)),
      };
    }),
  };
}

/**
 * The record of each tutor chat among `chats` that has an approved plan and
 * has not switched memory off, loading its log first. A chat whose plan names
 * no subject (older plans never did) takes the subject of a later chat that
 * carried a topic over from it, so the two read together.
 */
export async function tutorLearningRecords(
  chats: readonly Chat[],
  ensureTutorSession: (chatId: string) => Promise<TutorSession>,
): Promise<LearningRecord[]> {
  const tutorChats = chats.filter(isSharedTutorChat);
  const states = await Promise.all(
    tutorChats.map(async (chat) => (await ensureTutorSession(chat.id)).state),
  );
  const inherited = new Map<string, string>();
  states.forEach((state) => {
    const subject = state.plan?.subject;
    if (!subject) return;
    for (const topic of Object.values(state.mastery)) {
      for (const evidence of topic.evidence) {
        const from = evidence.carriedOver?.chatId;
        if (from && !inherited.has(from)) inherited.set(from, subject);
      }
    }
  });
  return tutorChats.flatMap((chat, i) => {
    const record = learningRecord(chat, states[i]);
    if (!record) return [];
    const subject = record.subject ?? inherited.get(chat.id);
    return [subject ? { ...record, subject } : record];
  });
}
