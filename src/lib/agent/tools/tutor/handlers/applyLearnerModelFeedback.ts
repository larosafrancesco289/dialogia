import type { Message } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import {
  applyLearnerModelFeedback,
  getLatestLearnerModel,
  initializeLearnerModel,
} from '@/lib/agent/learnerModel';
import { processPlanProgress } from '@/lib/agent/planAwareTutor';

type ApplyLearnerModelFeedbackArgs = {
  nodeId: string;
  direction?: 'up' | 'down';
  magnitude?: number;
  reason?: string;
  estimatedConfidence?: number;
  confidenceFloor?: number;
  misconceptionId?: string;
  misconceptionDescription?: string;
};

export const applyLearnerModelFeedbackHandler: TutorToolHandler<ApplyLearnerModelFeedbackArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : undefined;
    if (!nodeId) return null;
    return {
      nodeId,
      direction:
        typeof args.direction === 'string'
          ? ((args.direction as string).trim() as 'up' | 'down')
          : undefined,
      magnitude:
        typeof args.magnitude === 'number' && Number.isFinite(args.magnitude as number)
          ? (args.magnitude as number)
          : undefined,
      reason: typeof args.reason === 'string' ? (args.reason as string).trim() : undefined,
      estimatedConfidence:
        typeof args.estimatedConfidence === 'number'
          ? (args.estimatedConfidence as number)
          : undefined,
      confidenceFloor:
        typeof args.confidenceFloor === 'number' ? (args.confidenceFloor as number) : undefined,
      misconceptionId:
        typeof args.misconceptionId === 'string'
          ? (args.misconceptionId as string).trim()
          : undefined,
      misconceptionDescription:
        typeof args.misconceptionDescription === 'string'
          ? (args.misconceptionDescription as string).trim()
          : undefined,
    };
  },

  async apply(ctx, args) {
    const plan = ctx.chat.settings.learningPlan;
    const state = ctx.get();
    const messagesForChat = (state.messages?.[ctx.chatId] ?? []) as Message[];
    let currentModel = getLatestLearnerModel(messagesForChat);
    if (!currentModel && plan) {
      currentModel = initializeLearnerModel(ctx.chatId, plan);
    }
    const nodeMeta = plan?.nodes.find((node) => node.id === args.nodeId);
    if (!currentModel) {
      return { handled: true, usedContent: false, updatedPlan: plan };
    }

    const result = applyLearnerModelFeedback(currentModel, {
      nodeId: args.nodeId,
      direction: args.direction,
      magnitude: args.magnitude,
      reason: args.reason,
      estimatedConfidence: args.estimatedConfidence,
      confidenceFloor: args.confidenceFloor,
      misconceptionId: args.misconceptionId,
      misconceptionDescription: args.misconceptionDescription,
    });

    const planResult = plan ? await processPlanProgress(plan, result.model) : undefined;
    const summary =
      nodeMeta && result.from != null && result.to != null
        ? `${nodeMeta.name}: ${Math.round((result.from || 0) * 100)}% → ${Math.round((result.to || 0) * 100)}% (learner feedback)`
        : `Adjusted mastery for ${args.nodeId}`;
    const planUpdatesWithSummary: Message['planUpdates'] | undefined = (planResult?.planUpdates as
      | Message['planUpdates']
      | undefined) ?? {
      masteryChanges:
        result.from != null && result.to != null
          ? [{ nodeId: args.nodeId, from: result.from, to: result.to }]
          : undefined,
    };
    if (planUpdatesWithSummary) {
      planUpdatesWithSummary.summary = planUpdatesWithSummary.summary ?? summary;
    }

    return {
      handled: true,
      usedContent: false,
      learnerModel: result.model,
      planUpdates: planUpdatesWithSummary,
      updatedPlan: planResult?.updatedPlan ?? plan,
      learnerModelDebug: {
        nodeId: args.nodeId,
        weight: (result.to ?? 0) - (result.from ?? 0),
        oldConfidence: result.from,
        newConfidence: result.to,
        note: result.note,
      },
    };
  },
};
