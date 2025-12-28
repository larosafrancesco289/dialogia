import type { PlanTurnOptions, PlanTurnResult } from '@/lib/agent/types';
import type { Evidence, Message, Misconception } from '@/lib/types';
import { getNextNode, processPlanProgress } from '@/lib/learningPlan/service';
import {
  extractEvidence,
  getLatestLearnerModel,
  initializeLearnerModel,
  updateLearnerModel,
} from '@/lib/agent/learnerModel';
import { logger } from '@/lib/logger';

export async function updateLearnerModelFromTurn(args: {
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
  const { chat, chatId, userContent, messagesForChat, currentPlan, turn } = args;
  if (!currentPlan || !userContent) return {};

  try {
    const plan = currentPlan;
    const currentModel =
      getLatestLearnerModel(messagesForChat) ?? initializeLearnerModel(chatId, plan);
    const activeNode = getNextNode(plan);

    if (!activeNode) return {};

    const window = [
      ...messagesForChat.slice(-10),
      { role: 'user', content: userContent, id: 'temp-user', createdAt: Date.now() } as Message,
    ];

    const modelId = args.modelId ?? chat.settings.model;
    const evidence = await extractEvidence(
      activeNode.id,
      activeNode.name,
      activeNode.objectives,
      window,
      { apiKey: turn.apiKey, transport: turn.transport, model: modelId },
    );

    const misconceptionDescription = evidence.misconception?.trim();
    const shouldApplyEvidence = evidence.weight !== 0 || !!misconceptionDescription;

    if (!shouldApplyEvidence) return {};

    const timestamp = Date.now();
    const fullEvidence: Evidence = {
      type: evidence.type,
      details: evidence.details,
      weight: evidence.weight,
      timestamp,
      skill: activeNode.id,
    };
    const misconception: Misconception | undefined = misconceptionDescription
      ? {
          id: `misc_${activeNode.id}_${timestamp}`,
          description: misconceptionDescription,
          firstObserved: timestamp,
          occurrences: 1,
          resolved: false,
        }
      : undefined;

    const updatedModel = updateLearnerModel(currentModel, {
      nodeId: activeNode.id,
      evidence: fullEvidence,
      misconception,
    });

    const progress = await processPlanProgress(plan, updatedModel);
    const nextPlan = progress.updatedPlan !== plan ? progress.updatedPlan : plan;

    return {
      learnerModel: updatedModel,
      updatedPlan: progress.updatedPlan !== plan ? progress.updatedPlan : undefined,
      planUpdates: progress.planUpdates,
      nextPlan,
    };
  } catch (err) {
    logger.error('Failed to update learner model', err);
    return {};
  }
}
