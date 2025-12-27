import type { Evidence, Message, Misconception } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import {
  getLatestLearnerModel,
  initializeLearnerModel,
  updateLearnerModel,
} from '@/lib/agent/learnerModel';
import { processPlanProgress } from '@/lib/learningPlan/service';

type UpdateLearnerModelArgs = {
  nodeId: string;
  evidence: Array<Pick<Evidence, 'type' | 'weight' | 'details' | 'skill'>>;
  misconceptions: Array<{ description: string; severity?: string; examples?: string[] }>;
  notes?: string;
  confidenceBefore?: number;
  confidenceAfter?: number;
  masteryLevel?: string;
};

export const updateLearnerModelHandler: TutorToolHandler<UpdateLearnerModelArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : undefined;
    if (!nodeId) return null;
    const evidenceRaw = Array.isArray(args.evidence)
      ? args.evidence
      : args.evidence && typeof args.evidence === 'object'
        ? [args.evidence]
        : [];
    const evidence = evidenceRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const type = typeof record.type === 'string' ? record.type.trim() : undefined;
        const weight =
          typeof record.weight === 'number' && Number.isFinite(record.weight)
            ? record.weight
            : undefined;
        if (!type || weight == null) return null;
        const details = typeof record.details === 'string' ? record.details.trim() : undefined;
        const skill = typeof record.skill === 'string' ? record.skill.trim() : undefined;
        return {
          type: type as Evidence['type'],
          weight,
          details,
          skill,
        };
      })
      .filter(Boolean) as Array<Pick<Evidence, 'type' | 'weight' | 'details' | 'skill'>>;

    const misconceptionsRaw = Array.isArray(args.misconceptions)
      ? args.misconceptions
      : args.misconceptions && typeof args.misconceptions === 'object'
        ? [args.misconceptions]
        : [];
    const misconceptions = misconceptionsRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const description =
          typeof record.description === 'string' ? record.description.trim() : undefined;
        if (!description) return null;
        const severity = typeof record.severity === 'string' ? record.severity.trim() : undefined;
        const examples =
          Array.isArray(record.examples) && record.examples.length > 0
            ? (record.examples as string[])
            : undefined;
        return {
          description,
          severity,
          examples,
        };
      })
      .filter(Boolean) as Array<{ description: string; severity?: string; examples?: string[] }>;

    const notes = typeof args.notes === 'string' ? args.notes.trim() : undefined;

    const confidenceBefore =
      typeof args.confidenceBefore === 'number' ? args.confidenceBefore : undefined;
    const confidenceAfter =
      typeof args.confidenceAfter === 'number' ? args.confidenceAfter : undefined;
    const masteryLevel =
      typeof args.masteryLevel === 'string' ? args.masteryLevel.trim() : undefined;

    return {
      nodeId,
      evidence,
      misconceptions,
      notes,
      confidenceBefore,
      confidenceAfter,
      masteryLevel,
    };
  },

  async apply(ctx, args) {
    const plan = ctx.chat.settings.learningPlan;

    await ctx.applyTutorPatch((prev) => {
      const prior = Array.isArray(prev.assessmentUpdates)
        ? (prev.assessmentUpdates as Record<string, unknown>[])
        : [];
      return {
        assessmentUpdates: [
          ...prior,
          {
            nodeId: args.nodeId,
            confidenceBefore: args.confidenceBefore,
            confidenceAfter: args.confidenceAfter,
            masteryLevel: args.masteryLevel,
            evidence: args.evidence,
            misconceptions: args.misconceptions,
            tutorComment: args.notes,
          },
        ],
      };
    });

    if (!plan) {
      return { handled: true, usedContent: true };
    }

    const state = ctx.get();
    const messagesForChat = (state.messages?.[ctx.chatId] ?? []) as Message[];
    let currentModel = getLatestLearnerModel(messagesForChat);
    if (!currentModel) {
      currentModel = initializeLearnerModel(ctx.chatId, plan);
    }

    if (args.evidence.length === 0 && args.misconceptions.length > 0) {
      args.evidence.push({
        type: 'misconception_detected',
        weight: 0,
        details: 'Misconception observed without specific evidence weight',
        skill: args.nodeId,
      });
    }

    if (!currentModel || args.evidence.length === 0) {
      return {
        handled: true,
        usedContent: false,
        learnerModel: currentModel,
        updatedPlan: plan,
      };
    }

    const nodeMeta = plan.nodes.find((node) => node.id === args.nodeId);
    const now = Date.now();
    let updatedModel = currentModel;
    const misconceptionQueue = args.misconceptions.slice();
    let appliedWeight = 0;

    args.evidence.forEach((entry, index) => {
      appliedWeight += entry.weight;
      const misconceptionMeta = misconceptionQueue.shift();
      const misconceptionObj: Misconception | undefined = misconceptionMeta
        ? {
            id: `misc_${args.nodeId}_${now + index}`,
            description: misconceptionMeta.description,
            firstObserved: now + index,
            occurrences: 1,
            resolved: false,
            severity: misconceptionMeta.severity,
            examples: misconceptionMeta.examples,
          }
        : undefined;
      const evidenceObj: Evidence = {
        timestamp: now + index,
        type: entry.type,
        weight: entry.weight,
        details: entry.details ?? 'No details provided',
        skill: entry.skill,
      };
      updatedModel = updateLearnerModel(updatedModel, {
        nodeId: args.nodeId,
        evidence: evidenceObj,
        misconception: misconceptionObj,
      });
    });

    const oldConfidence = currentModel.mastery[args.nodeId]?.confidence ?? 0;
    const newConfidence = updatedModel.mastery[args.nodeId]?.confidence ?? oldConfidence;

    const planResult = await processPlanProgress(plan, updatedModel);
    const hasMasteryDelta = oldConfidence !== newConfidence;
    const summary = nodeMeta
      ? hasMasteryDelta
        ? `${nodeMeta.name}: ${Math.round(oldConfidence * 100)}% → ${Math.round(newConfidence * 100)}%`
        : `${nodeMeta.name}: mastery reviewed`
      : hasMasteryDelta
        ? `Updated mastery for ${args.nodeId}`
        : `Reviewed mastery for ${args.nodeId}`;
    const planUpdatesWithSummary: Message['planUpdates'] | undefined =
      planResult.planUpdates ??
      (hasMasteryDelta
        ? {
            masteryChanges: [{ nodeId: args.nodeId, from: oldConfidence, to: newConfidence }],
          }
        : undefined);
    if (planUpdatesWithSummary) {
      planUpdatesWithSummary.summary = planUpdatesWithSummary.summary ?? summary;
    }

    return {
      handled: true,
      usedContent: false,
      learnerModel: updatedModel,
      planUpdates: planUpdatesWithSummary,
      updatedPlan: planResult.updatedPlan,
      learnerModelDebug: {
        nodeId: args.nodeId,
        nodeName: nodeMeta?.name,
        evidenceType: args.evidence[0]?.type,
        weight: appliedWeight,
        oldConfidence,
        newConfidence,
      },
    };
  },
};
