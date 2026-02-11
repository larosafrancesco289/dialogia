import type { Evidence, Message, Misconception } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import {
  applyLearnerModelFeedback,
  getLatestLearnerModel,
  initializeLearnerModel,
  resolveNodeId,
  updateLearnerModel,
} from '@/lib/agent/learner-model';
import { processPlanProgress } from '@/lib/learning-plan/service';
import { getMessagesForChat } from '@/lib/messages/indexing';

type RecordLearningArgs = {
  nodeId: string;
  source: 'assessment' | 'self_report';
  // For assessment source
  interaction?: {
    question: string;
    studentAnswer: string;
    correctAnswer?: string;
    isCorrect?: boolean;
    questionType?: string;
    hintsUsed?: number;
  };
  evidence?: Array<{
    type: Evidence['type'];
    weight: number;
    details?: string;
    skill?: string;
  }>;
  misconceptions?: Array<{
    id?: string;
    description: string;
    severity?: string;
    examples?: string[];
  }>;
  // For self_report source
  confidenceAdjustment?: {
    direction?: 'up' | 'down';
    magnitude?: number;
    reason?: string;
  };
  estimatedConfidence?: number;
  confidenceFloor?: number;
  misconceptionId?: string;
  misconceptionDescription?: string;
  notes?: string;
};

export const recordLearningHandler: TutorToolHandler<RecordLearningArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : undefined;
    if (!nodeId) return null;

    const source = args.source === 'self_report' ? 'self_report' : 'assessment';

    // Parse interaction (for assessment source)
    let interaction: RecordLearningArgs['interaction'];
    if (args.interaction && typeof args.interaction === 'object') {
      const int = args.interaction as Record<string, unknown>;
      interaction = {
        question: typeof int.question === 'string' ? int.question.trim() : '',
        studentAnswer: typeof int.studentAnswer === 'string' ? int.studentAnswer.trim() : '',
        correctAnswer: typeof int.correctAnswer === 'string' ? int.correctAnswer.trim() : undefined,
        isCorrect: typeof int.isCorrect === 'boolean' ? int.isCorrect : undefined,
        questionType: typeof int.questionType === 'string' ? int.questionType : undefined,
        hintsUsed: typeof int.hintsUsed === 'number' ? int.hintsUsed : undefined,
      };
    }

    // Parse evidence
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
        return {
          type: type as Evidence['type'],
          weight,
          details: typeof record.details === 'string' ? record.details.trim() : undefined,
          skill: typeof record.skill === 'string' ? record.skill.trim() : undefined,
        };
      })
      .filter(Boolean) as RecordLearningArgs['evidence'];

    // Parse misconceptions
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
        return {
          id: typeof record.id === 'string' ? record.id.trim() : undefined,
          description,
          severity: typeof record.severity === 'string' ? record.severity.trim() : undefined,
          examples:
            Array.isArray(record.examples) && record.examples.length > 0
              ? (record.examples as string[])
              : undefined,
        };
      })
      .filter(Boolean) as RecordLearningArgs['misconceptions'];

    // Parse confidenceAdjustment (for self_report source)
    let confidenceAdjustment: RecordLearningArgs['confidenceAdjustment'];
    if (args.confidenceAdjustment && typeof args.confidenceAdjustment === 'object') {
      const adj = args.confidenceAdjustment as Record<string, unknown>;
      confidenceAdjustment = {
        direction: adj.direction === 'up' || adj.direction === 'down' ? adj.direction : undefined,
        magnitude:
          typeof adj.magnitude === 'number' && Number.isFinite(adj.magnitude)
            ? adj.magnitude
            : undefined,
        reason: typeof adj.reason === 'string' ? adj.reason.trim() : undefined,
      };
    }

    const estimatedConfidence =
      typeof args.estimatedConfidence === 'number' && Number.isFinite(args.estimatedConfidence)
        ? args.estimatedConfidence
        : undefined;
    const confidenceFloor =
      typeof args.confidenceFloor === 'number' && Number.isFinite(args.confidenceFloor)
        ? args.confidenceFloor
        : undefined;
    const misconceptionId =
      typeof args.misconceptionId === 'string' ? args.misconceptionId.trim() : undefined;
    const misconceptionDescription =
      typeof args.misconceptionDescription === 'string'
        ? args.misconceptionDescription.trim()
        : undefined;

    const notes = typeof args.notes === 'string' ? args.notes.trim() : undefined;

    return {
      nodeId,
      source,
      interaction,
      evidence,
      misconceptions,
      confidenceAdjustment,
      estimatedConfidence,
      confidenceFloor,
      misconceptionId,
      misconceptionDescription,
      notes,
    };
  },

  async apply(ctx, args) {
    const {
      nodeId,
      source,
      interaction,
      evidence,
      misconceptions,
      confidenceAdjustment,
      estimatedConfidence,
      confidenceFloor,
      misconceptionId,
      misconceptionDescription,
      notes,
    } = args;

    // Get the most up-to-date plan
    const plan = ctx.getCurrentPlan?.() ?? ctx.chat.settings.features.tutor.learningPlan;

    // Store assessment updates in UI state
    await ctx.applyTutorPatch((prev) => {
      const prior = Array.isArray(prev.assessmentUpdates)
        ? (prev.assessmentUpdates as Record<string, unknown>[])
        : [];

      const update: Record<string, unknown> = { nodeId };

      if (interaction) {
        let result: 'correct' | 'incorrect' | 'partial' = 'partial';
        if (interaction.isCorrect === true) {
          result = 'correct';
        } else if (interaction.isCorrect === false) {
          result = 'incorrect';
        }
        update.evidence = [
          {
            question: interaction.question,
            studentAnswer: interaction.studentAnswer,
            correctAnswer: interaction.correctAnswer,
            questionType: interaction.questionType,
            result,
            hintsUsed: interaction.hintsUsed,
          },
        ];
      }

      if (evidence && evidence.length > 0) {
        update.evidence = evidence.map((e) => ({
          type: e.type,
          weight: e.weight,
          details: e.details,
          skill: e.skill,
        }));
      }

      if (misconceptions && misconceptions.length > 0) {
        update.misconceptions = misconceptions;
      }

      if (notes) {
        update.tutorComment = notes;
      }

      return { assessmentUpdates: [...prior, update] };
    });

    if (!plan) {
      return { handled: true, usedContent: false };
    }

    const state = ctx.get();
    const messagesForChat = getMessagesForChat(state, ctx.chatId);
    let currentModel =
      getLatestLearnerModel(messagesForChat) ??
      ctx.chat.settings.features.tutor.learnerModel ??
      initializeLearnerModel(ctx.chatId, plan);

    const nodeMeta = plan.nodes.find((node) => node.id === nodeId);

    // Handle self_report source - apply feedback adjustment
    if (source === 'self_report') {
      const hasFeedbackSignal =
        !!confidenceAdjustment?.direction ||
        confidenceAdjustment?.magnitude != null ||
        !!confidenceAdjustment?.reason ||
        estimatedConfidence != null ||
        confidenceFloor != null ||
        !!misconceptionId ||
        !!misconceptionDescription;

      if (!hasFeedbackSignal) {
        return { handled: true, usedContent: false };
      }
      const result = applyLearnerModelFeedback(currentModel, {
        nodeId,
        direction: confidenceAdjustment?.direction,
        magnitude: confidenceAdjustment?.magnitude,
        reason: confidenceAdjustment?.reason,
        estimatedConfidence,
        confidenceFloor,
        misconceptionId,
        misconceptionDescription,
      });
      const resolvedId = resolveNodeId(currentModel.mastery, nodeId) ?? nodeId;

      const planResult = await processPlanProgress(plan, result.model);
      const hasMasteryDelta = result.from != null && result.to != null && result.from !== result.to;
      let summary: string;
      if (nodeMeta && result.from != null && result.to != null) {
        if (hasMasteryDelta) {
          const fromPct = Math.round((result.from || 0) * 100);
          const toPct = Math.round((result.to || 0) * 100);
          summary = `${nodeMeta.name}: ${fromPct}% → ${toPct}% (learner feedback)`;
        } else {
          summary = `${nodeMeta.name}: mastery reviewed (learner feedback)`;
        }
      } else if (hasMasteryDelta) {
        summary = `Adjusted mastery for ${resolvedId}`;
      } else {
        summary = `Reviewed mastery for ${resolvedId}`;
      }

      const planUpdatesWithSummary: Message['planUpdates'] | undefined =
        (planResult?.planUpdates as Message['planUpdates'] | undefined) ??
        (hasMasteryDelta
          ? { masteryChanges: [{ nodeId: resolvedId, from: result.from!, to: result.to! }] }
          : undefined);

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
          nodeId: resolvedId,
          weight: (result.to ?? 0) - (result.from ?? 0),
          oldConfidence: result.from,
          newConfidence: result.to,
          note: result.note,
        },
      };
    }

    // Handle assessment source - update learner model with evidence
    const evidenceToApply = evidence || [];

    // If we have interaction but no evidence, create evidence from the interaction
    if (evidenceToApply.length === 0 && interaction) {
      let weight: number;
      let type: Evidence['type'];
      if (interaction.isCorrect === true) {
        weight = 0.5;
        type = 'correct_answer';
      } else if (interaction.isCorrect === false) {
        weight = -0.3;
        type = 'incorrect_answer';
      } else {
        weight = 0.1;
        type = 'partial_answer';
      }
      evidenceToApply.push({
        type,
        weight,
        details: `Q: ${interaction.question}\nA: ${interaction.studentAnswer}`,
        skill: nodeId,
      });
    }

    // If we have misconceptions but no evidence, create placeholder evidence
    if (evidenceToApply.length === 0 && misconceptions && misconceptions.length > 0) {
      evidenceToApply.push({
        type: 'misconception_detected',
        weight: 0,
        details: 'Misconception observed without specific evidence weight',
        skill: nodeId,
      });
    }

    if (!currentModel || evidenceToApply.length === 0) {
      return {
        handled: true,
        usedContent: false,
        learnerModel: currentModel,
        updatedPlan: plan,
      };
    }

    const now = Date.now();
    let updatedModel = currentModel;
    const misconceptionQueue = (misconceptions || []).slice();
    let appliedWeight = 0;

    evidenceToApply.forEach((entry, index) => {
      appliedWeight += entry.weight;
      const misconceptionMeta = misconceptionQueue.shift();
      const misconceptionObj: Misconception | undefined = misconceptionMeta
        ? {
            id: misconceptionMeta.id || `misc_${nodeId}_${now + index}`,
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
        nodeId,
        evidence: evidenceObj,
        misconception: misconceptionObj,
      });
    });

    const resolvedId = resolveNodeId(currentModel.mastery, nodeId) ?? nodeId;
    const oldConfidence = currentModel.mastery[resolvedId]?.confidence ?? 0;
    const newConfidence = updatedModel.mastery[resolvedId]?.confidence ?? oldConfidence;

    const hasMasteryDelta = oldConfidence !== newConfidence;
    const label = nodeMeta?.name ?? nodeId;
    let summary: string;
    if (hasMasteryDelta) {
      const fromPct = Math.round(oldConfidence * 100);
      const toPct = Math.round(newConfidence * 100);
      summary = `${label}: ${fromPct}% → ${toPct}%`;
    } else {
      summary = `${label}: mastery reviewed`;
    }

    const planUpdatesWithSummary: Message['planUpdates'] | undefined = hasMasteryDelta
      ? {
          masteryChanges: [{ nodeId: resolvedId, from: oldConfidence, to: newConfidence }],
          summary,
        }
      : undefined;

    return {
      handled: true,
      usedContent: false,
      learnerModel: updatedModel,
      planUpdates: planUpdatesWithSummary,
      updatedPlan: plan,
      learnerModelDebug: {
        nodeId: resolvedId,
        nodeName: nodeMeta?.name,
        evidenceType: evidenceToApply[0]?.type,
        weight: appliedWeight,
        oldConfidence,
        newConfidence,
      },
    };
  },
};
