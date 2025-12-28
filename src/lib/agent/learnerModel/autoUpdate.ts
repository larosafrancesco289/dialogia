import type { PlanTurnOptions, PlanTurnResult } from '@/lib/agent/types';
import type { Message } from '@/lib/types';
import { updateLearnerModelFromTurn } from '@/lib/agent/learnerModel/updateFromTurn';

export async function autoUpdateLearnerModelFromTurn(args: {
  chat: PlanTurnOptions['chat'];
  chatId: string;
  userContent?: string;
  messagesForChat: Message[];
  currentPlan?: PlanTurnOptions['chat']['settings']['learningPlan'];
  turn: PlanTurnOptions['turn'];
  modelId?: string;
}): Promise<{
  learnerModel?: PlanTurnResult['learnerModel'];
  planUpdates?: PlanTurnResult['planUpdates'];
  updatedPlan?: PlanTurnResult['updatedPlan'];
  nextPlan?: PlanTurnOptions['chat']['settings']['learningPlan'];
}> {
  return updateLearnerModelFromTurn(args);
}
