import type { LearnerModel, Message } from '@/lib/types';

/**
 * Get latest learner model from message history
 */
export function getLatestLearnerModel(messages: Message[]): LearnerModel | undefined {
  // Search backwards for most recent assistant message with learnerModel
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].learnerModel) {
      return messages[i].learnerModel;
    }
  }
  return undefined;
}

/**
 * The learner model the tutor and the learner should both see: the newer of
 * the latest message snapshot and the model saved on the chat. A learner's
 * correction is saved on the chat, so reading snapshots alone would let the
 * next turn quietly undo it.
 */
export function resolveLearnerModel(
  messages: Message[],
  saved: LearnerModel | undefined,
): LearnerModel | undefined {
  const fromMessages = getLatestLearnerModel(messages);
  if (!saved) return fromMessages;
  if (!fromMessages) return saved;
  return saved.updatedAt >= fromMessages.updatedAt ? saved : fromMessages;
}
