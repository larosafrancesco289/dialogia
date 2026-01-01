import { v4 as uuidv4 } from 'uuid';
import type { StoreGetter, StoreSetter } from '@/lib/store/types';
import type { Repository } from '@/lib/db/repository';
import type { LearnerModelFeedback } from '@/lib/agent/learnerModel';
import type { Message } from '@/lib/types';
import {
  applyLearnerModelFeedback,
  getLatestLearnerModel,
  initializeLearnerModel,
} from '@/lib/agent/learnerModel';
import { processPlanProgress } from '@/lib/learningPlan/service';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';

export async function applyLearnerModelFeedbackFromUser({
  input,
  set,
  get,
  repository,
}: {
  input: LearnerModelFeedback;
  set: StoreSetter;
  get: StoreGetter;
  repository: Repository;
}): Promise<void> {
  const state = get();
  const chatId = state.selectedChatId;
  if (!chatId) return;
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat || !chat.settings.learningPlan) return;

  const plan = chat.settings.learningPlan;
  const messages = getMessagesForChat(state, chatId);
  const baseModel = getLatestLearnerModel(messages) ?? initializeLearnerModel(chatId, plan);
  const feedback = applyLearnerModelFeedback(baseModel, input);
  const planResult = await processPlanProgress(plan, feedback.model);
  const updatedPlan = planResult.updatedPlan ?? plan;

  if (typeof state.updateChatSettings === 'function') {
    await state.updateChatSettings({ learningPlan: updatedPlan });
  }

  const nodeMeta = plan.nodes.find((n) => n.id === input.nodeId);
  const beforePct = feedback.from != null ? Math.round((feedback.from || 0) * 100) : undefined;
  const afterPct = feedback.to != null ? Math.round((feedback.to || 0) * 100) : undefined;
  const hasMasteryDelta =
    feedback.from != null && feedback.to != null && feedback.from !== feedback.to;
  const summaryParts = [
    `${hasMasteryDelta ? 'Adjusted' : 'Reviewed'} mastery for ${nodeMeta?.name || input.nodeId}.`,
  ];
  if (beforePct != null && afterPct != null && beforePct !== afterPct) {
    summaryParts.push(`Confidence ${beforePct}% \u2192 ${afterPct}%.`);
  }
  if (feedback.resolved?.length) {
    summaryParts.push(`Resolved: ${feedback.resolved.join(', ')}`);
  }
  if (input.reason) summaryParts.push(input.reason);

  const planUpdates =
    planResult.planUpdates ??
    ({
      masteryChanges: hasMasteryDelta
        ? [{ nodeId: input.nodeId, from: feedback.from!, to: feedback.to! }]
        : undefined,
      summary: summaryParts.join(' '),
    } as Message['planUpdates']);
  if (planUpdates && !planUpdates.summary) {
    planUpdates.summary = summaryParts.join(' ');
  }

  const assistantMessage: Message = {
    id: uuidv4(),
    chatId,
    role: 'assistant',
    content: summaryParts.join(' '),
    createdAt: Date.now(),
    model: chat.settings.model || DEFAULT_TUTOR_MODEL_ID,
    learnerModel: feedback.model,
    planUpdates,
    metadata: { kind: 'learner_model_feedback' },
  };

  set((s) => appendMessagesToChat(s, chatId, [assistantMessage]));

  const persistMessage = createMessagePersister(repository);
  await persistMessage(assistantMessage).catch(() => undefined);
}
