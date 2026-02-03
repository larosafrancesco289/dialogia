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
