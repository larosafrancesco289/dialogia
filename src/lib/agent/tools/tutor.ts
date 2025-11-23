import { v4 as uuidv4 } from 'uuid';
import type {
  Chat,
  LearningPlan,
  LearnerModel,
  Message,
  MessageTutor,
  TutorPlanSuggestion,
  TutorDiagnosticItem,
  Evidence,
  Misconception,
} from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import { attachTutorUiState } from '@/lib/agent/tutorFlow';
import { addCardsToDeck, getDueCards } from '@/lib/tutorDeck';
import { validateLearningPlan } from '@/lib/agent/planGenerator';
import type {
  PersistMessage,
  StoreSetter,
  StoreGetter,
  TutorToolName,
} from '@/lib/agent/types';
import {
  getLatestLearnerModel,
  initializeLearnerModel,
  applyLearnerModelFeedback,
  updateLearnerModel,
} from '@/lib/agent/learnerModel';
import { processPlanProgress } from '@/lib/agent/planAwareTutor';
import { getNextNode } from '@/lib/learningPlan/service';

const TUTOR_TOOL_NAME_SET = new Set<TutorToolName>([
  'ask_student_question',
  'create_diagnostic',
  'generate_plan',
  'update_plan',
  'assess_answer',
  'update_learner_model',
  'apply_learner_model_feedback',
  'get_plan_suggestions',
  'quiz_mcq',
  'quiz_fill_blank',
  'quiz_open_ended',
  'flashcards',
  'grade_open_response',
  'add_to_deck',
  'srs_review',
]);

const QUIZ_TOOLS = new Set<TutorToolName>(['quiz_mcq', 'quiz_fill_blank', 'quiz_open_ended']);
const DIAGNOSTIC_DIFFICULTIES = new Set<TutorDiagnosticItem['difficulty']>([
  'beginner',
  'intermediate',
  'advanced',
  'mixed',
  'easy',
  'medium',
  'hard',
]);

export function recordTutorToolUsage(opts: {
  set: StoreSetter;
  chatId: string;
  assistantMessageId: string;
  plan?: LearningPlan | null;
  name: TutorToolName;
}) {
  const { set, chatId, assistantMessageId, plan, name } = opts;
  set((state) => {
    const usageByChat = state.ui.tutorToolUsageByChatId || {};
    const prev = usageByChat[chatId] || {};
    const sameTurn = prev.lastMessageId === assistantMessageId;
    const activeNodeId = plan ? getNextNode(plan)?.id ?? '__global__' : '__global__';
    const nextUsage = {
      ...prev,
      lastMessageId: assistantMessageId,
      toolsThisTurn: (sameTurn ? prev.toolsThisTurn || 0 : 0) + 1,
      mcqByNode: { ...(prev.mcqByNode || {}) },
    };

    if (QUIZ_TOOLS.has(name)) {
      nextUsage.mcqByNode[activeNodeId] = (nextUsage.mcqByNode[activeNodeId] || 0) + 1;
    }
    if (name === 'create_diagnostic') {
      nextUsage.diagnosticsUsed = (nextUsage.diagnosticsUsed ?? 0) + 1;
    }

    return {
      ui: {
        ...state.ui,
        tutorToolUsageByChatId: { ...usageByChat, [chatId]: nextUsage },
      },
    } as Partial<StoreState>;
  });
}

const CONTENT_KEYS: Array<keyof MessageTutor> = [
  'questionnaire',
  'diagnostic',
  'planProposal',
  'mcq',
  'fillBlank',
  'openEnded',
  'flashcards',
];

export function isTutorToolName(name: string): name is TutorToolName {
  return TUTOR_TOOL_NAME_SET.has(name as TutorToolName);
}
export type TutorQuizPayload = {
  items: Array<{ id: string; [key: string]: unknown }>;
};

export function normalizeTutorQuizPayload(args: unknown): TutorQuizPayload | null {
  if (!args || typeof args !== 'object') return null;
  const record = args as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items : [];
  if (items.length === 0) return null;
  const normalized = items.slice(0, 40).map((item) => {
    const data = item as Record<string, unknown>;
    const rawId = typeof data.id === 'string' ? data.id.trim() : '';
    const id = !rawId || rawId === 'null' || rawId === 'undefined' ? uuidv4() : rawId;
    return { ...data, id };
  });
  return { items: normalized };
}

const PLAN_SUGGESTION_PRIORITIES = new Set(['low', 'medium', 'high']);

function normalizePlanSuggestions(items: unknown[]): TutorPlanSuggestion[] {
  return items
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const action =
        typeof record.action === 'string' ? record.action.trim() : undefined;
      if (!action) return null;
      const priorityRaw =
        typeof record.priority === 'string' ? record.priority.trim().toLowerCase() : undefined;
      const priority = priorityRaw && PLAN_SUGGESTION_PRIORITIES.has(priorityRaw)
        ? priorityRaw
        : undefined;
      const description =
        typeof record.description === 'string'
          ? record.description.trim()
          : undefined;
      const rationale =
        typeof record.rationale === 'string'
          ? record.rationale.trim()
          : undefined;
      const estimatedImpact =
        typeof record.estimatedImpact === 'string'
          ? record.estimatedImpact.trim()
          : undefined;
      const implementationDetails =
        record.implementationDetails && typeof record.implementationDetails === 'object'
          ? (record.implementationDetails as Record<string, unknown>)
          : undefined;
      return {
        action,
        priority: priority as 'low' | 'medium' | 'high' | undefined,
        description,
        rationale,
        estimatedImpact,
        implementationDetails,
      };
    })
    .filter(Boolean) as TutorPlanSuggestion[];
}

function withContentReset(
  activeKey: keyof MessageTutor,
  patch: Partial<MessageTutor>,
): Partial<MessageTutor> {
  const reset: Partial<MessageTutor> = {};
  CONTENT_KEYS.forEach((key) => {
    if (key === activeKey) return;
    (reset as any)[key] = undefined;
  });
  reset.attempts = undefined;
  reset.grading = undefined;
  return { ...reset, ...patch };
}

export async function applyTutorToolCall(opts: {
  name: TutorToolName;
  args: Record<string, unknown>;
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  set: StoreSetter;
  get: StoreGetter;
  persistMessage: PersistMessage;
}): Promise<{
  handled: boolean;
  usedContent: boolean;
  payload?: string;
  learnerModel?: LearnerModel;
  planUpdates?: Message['planUpdates'];
  updatedPlan?: LearningPlan;
  learnerModelDebug?: {
    nodeId: string;
    nodeName?: string;
    evidenceType?: Evidence['type'];
    weight?: number;
    oldConfidence?: number;
    newConfidence?: number;
    note?: string;
  };
}> {
  const { name, args, chat, chatId, assistantMessage, set, get, persistMessage } = opts;

  const applyTutorPatch = async (
    buildPatch: (prev: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    let updatedMsg: Message | undefined;
    set((state) => {
      const list = state.messages[chatId] ?? [];
       const prev =
         ((state.ui.tutorByMessageId || {})[assistantMessage.id] as Record<string, unknown>) || {};
      const patch = buildPatch(prev);
      const result = attachTutorUiState({
        currentUi: state.ui.tutorByMessageId,
        currentMessages: list,
        messageId: assistantMessage.id,
        patch,
      });
      if (result.updatedMessage) updatedMsg = result.updatedMessage;
      return {
        ui: { ...state.ui, tutorByMessageId: result.nextUi },
        messages: { ...state.messages, [chatId]: result.nextMessages },
      } as Partial<StoreState>;
    });
    if (updatedMsg) {
      await persistMessage(updatedMsg).catch(() => undefined);
    }
    return updatedMsg;
  };

  if (name === 'ask_student_question') {
    const rawQuestions = Array.isArray(args['questions']) ? (args['questions'] as unknown[]) : [];
    const normalizedQuestions = rawQuestions
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const questionText =
          typeof record.question === 'string' ? record.question.trim() : undefined;
        if (!questionText) return null;
    const optionsRaw = Array.isArray(record.options) ? (record.options as unknown[]) : [];
    const options = optionsRaw
      .map((opt) => {
        if (!opt || typeof opt !== 'object') return null;
        const optRecord = opt as Record<string, unknown>;
        const label =
          typeof optRecord.label === 'string'
            ? optRecord.label.trim()
                : typeof optRecord.title === 'string'
                  ? optRecord.title.trim()
                  : '';
            if (!label) return null;
            const description =
              typeof optRecord.description === 'string'
                ? optRecord.description.trim()
                : undefined;
            return { label, description };
          })
          .filter(Boolean) as Array<{ label: string; description?: string }>;
        if (options.length < 2) return null;
        const allowMultiple =
          typeof record.allowMultiple === 'boolean'
            ? record.allowMultiple
            : typeof record.multiSelect === 'boolean'
              ? record.multiSelect
              : false;
        const followUpBehavior =
          typeof record.followUpBehavior === 'string'
            ? record.followUpBehavior
            : (undefined as string | undefined);
        const category =
          typeof record.category === 'string'
            ? record.category.trim()
            : typeof record.header === 'string'
              ? record.header.trim()
              : undefined;
        const idRaw =
          typeof record.id === 'string'
            ? record.id.trim()
            : `question_${index + 1}_${uuidv4()}`;
        return {
          id: idRaw,
          question: questionText,
          category,
          allowMultiple,
          followUpBehavior:
            followUpBehavior === 'required' || followUpBehavior === 'optional'
              ? followUpBehavior
              : 'none',
          options,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      question: string;
      category?: string;
      allowMultiple?: boolean;
      followUpBehavior: 'required' | 'optional' | 'none';
      options: Array<{ label: string; description?: string }>;
    }>;

    if (normalizedQuestions.length === 0) {
      return { handled: false, usedContent: false };
    }

    const title =
      typeof args['title'] === 'string'
        ? args['title'].trim()
        : typeof args['prompt'] === 'string'
          ? args['prompt'].trim()
          : undefined;

    await applyTutorPatch((prev) =>
      withContentReset('questionnaire', {
        questionnaire: {
          questions: normalizedQuestions,
          status: 'awaiting' as const,
          submittedAt: undefined,
          responses: undefined,
        },
        title: title || (typeof prev.title === 'string' ? prev.title : undefined),
      }),
    );

    try {
      return {
        handled: true,
        usedContent: true,
        payload: JSON.stringify({
          status: 'awaiting_student',
          questionCount: normalizedQuestions.length,
        }),
      };
    } catch {
      return { handled: true, usedContent: true };
    }
  }

  if (name === 'create_diagnostic') {
    const diagnosticId =
      typeof args['diagnosticId'] === 'string' && args['diagnosticId'].trim()
        ? (args['diagnosticId'] as string).trim()
        : `diag_${uuidv4()}`;
    const topic =
      typeof args['topic'] === 'string' ? (args['topic'] as string).trim() : undefined;
    const depthRaw =
      typeof args['depth'] === 'string' ? (args['depth'] as string).trim() : undefined;
    const depth: 'quick' | 'moderate' | 'comprehensive' =
      depthRaw === 'moderate' || depthRaw === 'comprehensive' ? depthRaw : 'quick';
    const quiz = args['quiz'] && typeof args['quiz'] === 'object' ? (args['quiz'] as any) : {};
    const itemsRaw = Array.isArray(quiz?.items) ? quiz.items : [];
    const normalizedItems = itemsRaw
      .map((item: any, index: number) => {
        if (!item || typeof item !== 'object') return null;
        const question =
          typeof item.question === 'string' ? item.question.trim() : undefined;
        const choicesRaw = Array.isArray(item.choices) ? item.choices : [];
        const choices = choicesRaw
          .map((choice: unknown) => (typeof choice === 'string' ? choice.trim() : undefined))
          .filter(
            (choice: unknown): choice is string =>
              typeof choice === 'string' && choice.trim().length > 0,
          );
        if (!question || choices.length < 2) return null;
        const id =
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : `diagnostic_item_${index + 1}_${uuidv4()}`;
        const correct =
          typeof item.correct === 'number' && Number.isFinite(item.correct) ? item.correct : undefined;
        const explanation =
          typeof item.explanation === 'string' ? item.explanation.trim() : undefined;
        const skill = typeof item.skill === 'string' ? item.skill.trim() : undefined;
        const rawDifficulty =
          typeof item.difficulty === 'string' ? item.difficulty.trim() : undefined;
        const difficulty =
          rawDifficulty && DIAGNOSTIC_DIFFICULTIES.has(rawDifficulty as TutorDiagnosticItem['difficulty'])
            ? (rawDifficulty as TutorDiagnosticItem['difficulty'])
            : undefined;
        return {
          id,
          question,
          choices,
          correct,
          explanation,
          skill,
          difficulty,
        };
      })
      .filter(Boolean) as TutorDiagnosticItem[];

    if (normalizedItems.length === 0) {
      return { handled: false, usedContent: false };
    }

    const adaptToAnswers =
      typeof args['adaptToAnswers'] === 'boolean'
        ? (args['adaptToAnswers'] as boolean)
        : typeof quiz?.adaptive === 'boolean'
          ? !!quiz.adaptive
          : false;
    const interpretation =
      quiz?.interpretation && typeof quiz.interpretation === 'object'
        ? (quiz.interpretation as Record<string, string>)
        : undefined;

    await applyTutorPatch(() =>
      withContentReset('diagnostic', {
        diagnostic: {
          diagnosticId,
          topic: topic || '',
          depth,
          items: normalizedItems,
          adaptToAnswers,
          interpretation,
          status: 'pending',
        },
      }),
    );

    try {
      return {
        handled: true,
        usedContent: true,
        payload: JSON.stringify({
          diagnosticId,
          itemCount: normalizedItems.length,
        }),
      };
    } catch {
      return { handled: true, usedContent: true };
    }
  }

  if (name === 'generate_plan' || name === 'update_plan') {
    const source =
      args['plan'] && typeof args['plan'] === 'object' ? (args['plan'] as Record<string, unknown>) : args;
    const nodesRaw = Array.isArray(source.nodes) ? source.nodes : [];
    const normalizedNodes = nodesRaw
      .map((node: any, index: number) => {
        if (!node || typeof node !== 'object') return null;
        const nameRaw = typeof node.name === 'string' ? node.name.trim() : undefined;
        const objectivesRaw = Array.isArray(node.objectives)
          ? (node.objectives as unknown[])
          : [];
        const objectives = objectivesRaw
          .map((obj: unknown) => (typeof obj === 'string' ? obj.trim() : undefined))
          .filter((obj): obj is string => !!obj);
        const prerequisitesRaw = Array.isArray(node.prerequisites)
          ? (node.prerequisites as unknown[])
          : [];
        const prerequisites = prerequisitesRaw
          .map((pr: unknown) => (typeof pr === 'string' ? pr.trim() : undefined))
          .filter((pr): pr is string => !!pr);
        if (!nameRaw || objectives.length === 0) return null;
        const id =
          typeof node.id === 'string' && node.id.trim()
            ? node.id.trim()
            : `node_${index + 1}_${uuidv4()}`;
        return {
          id,
          name: nameRaw,
          description:
            typeof node.description === 'string' ? node.description.trim() : undefined,
          objectives,
          prerequisites,
          status:
            node.status === 'in_progress' || node.status === 'completed'
              ? node.status
              : 'not_started',
          estimatedMinutes:
            typeof node.estimatedMinutes === 'number'
              ? Math.max(5, Math.min(360, Math.round(node.estimatedMinutes)))
              : undefined,
          resources: Array.isArray(node.resources) ? node.resources : undefined,
          children: Array.isArray(node.children) ? node.children : undefined,
        };
      })
      .filter(Boolean) as LearningPlan['nodes'];

    if (normalizedNodes.length === 0) {
      return { handled: false, usedContent: false };
    }

    const plan: LearningPlan = {
      goal:
        typeof source.goal === 'string' && source.goal.trim()
          ? (source.goal as string).trim()
          : chat.settings.learningPlan?.goal || 'Personalized Learning Plan',
      generatedAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      nodes: normalizedNodes,
      metadata:
        source.metadata && typeof source.metadata === 'object'
          ? (source.metadata as Record<string, unknown>)
          : undefined,
    };

    const validation = validateLearningPlan(plan);
    if (!validation.valid) {
      return { handled: false, usedContent: false };
    }

    const requiresConfirmation =
      typeof source.requiresConfirmation === 'boolean'
        ? (source.requiresConfirmation as boolean)
        : name !== 'update_plan';
    const confirmationMessage =
      typeof source.confirmationMessage === 'string'
        ? source.confirmationMessage.trim()
        : undefined;

    const normalizedSuggestions = Array.isArray(source.suggestions)
      ? normalizePlanSuggestions(source.suggestions as unknown[])
      : undefined;

    await applyTutorPatch((prev) =>
      withContentReset('planProposal', {
        planProposal: {
          plan,
          requiresConfirmation,
          confirmationMessage,
          status: 'pending' as const,
          requestedAt: Date.now(),
        },
        planSuggestions:
          normalizedSuggestions && normalizedSuggestions.length > 0
            ? normalizedSuggestions
            : Array.isArray(prev.planSuggestions)
              ? prev.planSuggestions
              : undefined,
      }),
    );

    try {
      return {
        handled: true,
        usedContent: true,
        payload: JSON.stringify({
          status: 'plan_ready',
          requiresConfirmation,
          nodes: plan.nodes.length,
        }),
      };
    } catch {
      return { handled: true, usedContent: true };
    }
  }

  if (name === 'get_plan_suggestions') {
    const suggestionsRaw = Array.isArray(args['suggestions'])
      ? (args['suggestions'] as unknown[])
      : [];
    const normalized = normalizePlanSuggestions(suggestionsRaw);

    if (normalized.length === 0) {
      return { handled: false, usedContent: false };
    }

    await applyTutorPatch((prev) => {
      const prior = Array.isArray(prev.planSuggestions)
        ? (prev.planSuggestions as TutorPlanSuggestion[])
        : [];
      const merged = [...prior, ...normalized];
      return { planSuggestions: merged };
    });

    try {
      return {
        handled: true,
        usedContent: false,
        payload: JSON.stringify({
          suggestionCount: normalized.length,
        }),
      };
    } catch {
      return { handled: true, usedContent: false };
    }
  }

  if (name === 'assess_answer') {
    const nodeId =
      typeof args['nodeId'] === 'string' ? (args['nodeId'] as string).trim() : undefined;
    const interaction =
      args['interaction'] && typeof args['interaction'] === 'object'
        ? (args['interaction'] as Record<string, unknown>)
        : undefined;
    if (!nodeId || !interaction) {
      return { handled: false, usedContent: false };
    }

    const evidence: Record<string, unknown> = {
      question:
        typeof interaction.question === 'string' ? interaction.question.trim() : '',
      studentAnswer:
        typeof interaction.studentAnswer === 'string'
          ? interaction.studentAnswer.trim()
          : '',
      correctAnswer:
        typeof interaction.correctAnswer === 'string'
          ? interaction.correctAnswer.trim()
          : undefined,
      questionType:
        typeof interaction.questionType === 'string'
          ? interaction.questionType
          : undefined,
      skill:
        typeof interaction.skill === 'string' ? interaction.skill.trim() : undefined,
      difficulty:
        typeof interaction.difficulty === 'string'
          ? interaction.difficulty.trim()
          : undefined,
      hintsUsed:
        typeof interaction.hintsUsed === 'number' ? interaction.hintsUsed : undefined,
      result:
        typeof interaction.correct === 'boolean'
          ? interaction.correct
            ? 'correct'
            : 'incorrect'
          : 'partial',
    };

    await applyTutorPatch((prev) => {
      const prior = Array.isArray(prev.assessmentUpdates)
        ? (prev.assessmentUpdates as Record<string, unknown>[])
        : [];
      return {
        assessmentUpdates: [
          ...prior,
          {
            nodeId,
            evidence: [evidence],
          },
        ],
      };
    });

    return { handled: true, usedContent: false };
  }

  if (name === 'update_learner_model') {
    const nodeId =
      typeof args['nodeId'] === 'string' ? (args['nodeId'] as string).trim() : undefined;
    if (!nodeId) return { handled: false, usedContent: false };
    const evidenceRaw = Array.isArray(args['evidence']) ? args['evidence'] : [];
    const evidence = evidenceRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const type =
          typeof record.type === 'string' ? record.type.trim() : undefined;
        const weight =
          typeof record.weight === 'number' && Number.isFinite(record.weight)
            ? record.weight
            : undefined;
        if (!type || weight == null) return null;
        const details =
          typeof record.details === 'string' ? record.details.trim() : undefined;
        const skill =
          typeof record.skill === 'string' ? record.skill.trim() : undefined;
        return {
          type: type as Evidence['type'],
          weight,
          details,
          skill,
        };
      })
      .filter(Boolean) as Array<Pick<Evidence, 'type' | 'weight' | 'details' | 'skill'>>;

    const misconceptionsRaw = Array.isArray(args['misconceptions'])
      ? args['misconceptions']
      : [];
    const misconceptions = misconceptionsRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const description =
          typeof record.description === 'string'
            ? record.description.trim()
            : undefined;
        if (!description) return null;
        const severity =
          typeof record.severity === 'string' ? record.severity.trim() : undefined;
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

    const notes =
      typeof args['notes'] === 'string' ? (args['notes'] as string).trim() : undefined;

    const confidenceBefore =
      typeof args['confidenceBefore'] === 'number' ? (args['confidenceBefore'] as number) : undefined;
    const confidenceAfter =
      typeof args['confidenceAfter'] === 'number' ? (args['confidenceAfter'] as number) : undefined;
    const masteryLevel =
      typeof args['masteryLevel'] === 'string' ? (args['masteryLevel'] as string).trim() : undefined;
    const plan = chat.settings.learningPlan;

    await applyTutorPatch((prev) => {
      const prior = Array.isArray(prev.assessmentUpdates)
        ? (prev.assessmentUpdates as Record<string, unknown>[])
        : [];
      return {
        assessmentUpdates: [
          ...prior,
          {
            nodeId,
            confidenceBefore,
            confidenceAfter,
            masteryLevel,
            evidence,
            misconceptions,
            tutorComment: notes,
          },
        ],
      };
    });

    if (!plan) {
      return { handled: true, usedContent: true };
    }

    const state = get();
    const messagesForChat = (state.messages?.[chatId] ?? []) as Message[];
    let currentModel = getLatestLearnerModel(messagesForChat);
    if (!currentModel) {
      currentModel = initializeLearnerModel(chatId, plan);
    }

    if (!currentModel || evidence.length === 0) {
      return {
        handled: true,
        usedContent: false,
        learnerModel: currentModel,
        updatedPlan: plan,
      };
    }

    const nodeMeta = plan.nodes.find((node) => node.id === nodeId);
    const now = Date.now();
    let updatedModel = currentModel;
    const misconceptionQueue = misconceptions.slice();
    let appliedWeight = 0;

    evidence.forEach((entry, index) => {
      appliedWeight += entry.weight;
      const misconceptionMeta = misconceptionQueue.shift();
      const misconceptionObj: Misconception | undefined = misconceptionMeta
        ? {
            id: `misc_${nodeId}_${now + index}`,
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

    const oldConfidence = currentModel.mastery[nodeId]?.confidence ?? 0;
    const newConfidence = updatedModel.mastery[nodeId]?.confidence ?? oldConfidence;

    const planResult = await processPlanProgress(plan, updatedModel);
    const summary = nodeMeta
      ? `${nodeMeta.name}: ${Math.round(oldConfidence * 100)}% → ${Math.round(newConfidence * 100)}%`
      : `Updated mastery for ${nodeId}`;
    const planUpdatesWithSummary: Message['planUpdates'] =
      planResult.planUpdates ?? {
        masteryChanges: [{ nodeId, from: oldConfidence, to: newConfidence }],
      };
    planUpdatesWithSummary.summary = planUpdatesWithSummary.summary ?? summary;

    return {
      handled: true,
      usedContent: false,
      learnerModel: updatedModel,
      planUpdates: planUpdatesWithSummary,
      updatedPlan: planResult.updatedPlan,
      learnerModelDebug: {
        nodeId,
        nodeName: nodeMeta?.name,
        evidenceType: evidence[0]?.type,
        weight: appliedWeight,
        oldConfidence,
        newConfidence,
      },
    };
  }

  if (name === 'apply_learner_model_feedback') {
    const nodeId =
      typeof args['nodeId'] === 'string' ? (args['nodeId'] as string).trim() : undefined;
    if (!nodeId) return { handled: false, usedContent: false };
    const plan = chat.settings.learningPlan;
    const state = get();
    const messagesForChat = (state.messages?.[chatId] ?? []) as Message[];
    let currentModel = getLatestLearnerModel(messagesForChat);
    if (!currentModel && plan) {
      currentModel = initializeLearnerModel(chatId, plan);
    }
    const nodeMeta = plan?.nodes.find((node) => node.id === nodeId);
    if (!currentModel) {
      return { handled: true, usedContent: false, updatedPlan: plan };
    }

    const result = applyLearnerModelFeedback(currentModel, {
      nodeId,
      direction:
        typeof args['direction'] === 'string'
          ? ((args['direction'] as string).trim() as 'up' | 'down')
          : undefined,
      magnitude:
        typeof args['magnitude'] === 'number' && Number.isFinite(args['magnitude'] as number)
          ? (args['magnitude'] as number)
          : undefined,
      reason: typeof args['reason'] === 'string' ? (args['reason'] as string).trim() : undefined,
      estimatedConfidence:
        typeof args['estimatedConfidence'] === 'number'
          ? (args['estimatedConfidence'] as number)
          : undefined,
      confidenceFloor:
        typeof args['confidenceFloor'] === 'number'
          ? (args['confidenceFloor'] as number)
          : undefined,
      misconceptionId:
        typeof args['misconceptionId'] === 'string'
          ? (args['misconceptionId'] as string).trim()
          : undefined,
      misconceptionDescription:
        typeof args['misconceptionDescription'] === 'string'
          ? (args['misconceptionDescription'] as string).trim()
          : undefined,
    });

    const planResult = plan ? await processPlanProgress(plan, result.model) : undefined;
    const summary =
      nodeMeta && result.from != null && result.to != null
        ? `${nodeMeta.name}: ${Math.round((result.from || 0) * 100)}% → ${Math.round((result.to || 0) * 100)}% (learner feedback)`
        : `Adjusted mastery for ${nodeId}`;
    const planUpdatesWithSummary: Message['planUpdates'] | undefined =
      (planResult?.planUpdates as Message['planUpdates'] | undefined) ?? {
        masteryChanges:
          result.from != null && result.to != null
            ? [{ nodeId, from: result.from, to: result.to }]
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
        nodeId,
        weight: (result.to ?? 0) - (result.from ?? 0),
        oldConfidence: result.from,
        newConfidence: result.to,
        note: result.note,
      },
    };
  }

  const patchTutorItems = async (mapKey: keyof Pick<MessageTutor, 'mcq' | 'fillBlank' | 'openEnded' | 'flashcards'>) => {
    const normalized = normalizeTutorQuizPayload(args);
    if (!normalized) return { handled: false, usedContent: false } as const;
    const titleFromArgs =
      typeof args['title'] === 'string' ? (args['title'] as string) : undefined;
    await applyTutorPatch((prev) =>
      withContentReset(mapKey, {
        [mapKey]: normalized.items,
        title:
          titleFromArgs ||
          (typeof prev.title === 'string' && prev.title.trim().length > 0 ? prev.title : undefined),
      }),
    );
    try {
      const payload: Record<string, unknown> = { items: normalized.items };
      if (titleFromArgs) payload.title = titleFromArgs;
      return { handled: true, usedContent: true, payload: JSON.stringify(payload) } as const;
    } catch (error) {
      console.error('Failed to serialize tutor items', error);
    }
    return { handled: true, usedContent: true } as const;
  };

  if (name === 'quiz_mcq') return patchTutorItems('mcq');
  if (name === 'quiz_fill_blank') return patchTutorItems('fillBlank');
  if (name === 'quiz_open_ended') return patchTutorItems('openEnded');
  if (name === 'flashcards') return patchTutorItems('flashcards');

  if (name === 'grade_open_response') {
    const rawId = typeof args['item_id'] === 'string' ? (args['item_id'] as string).trim() : '';
    if (!rawId || rawId === 'null' || rawId === 'undefined') return { handled: false, usedContent: false };
    const feedback =
      typeof args['feedback'] === 'string' ? (args['feedback'] as string).trim() : '';
    if (!feedback) return { handled: false, usedContent: false };
    const score = typeof args['score'] === 'number' ? (args['score'] as number) : undefined;
    const criteriaRaw = Array.isArray(args['criteria']) ? (args['criteria'] as unknown[]) : undefined;
    const criteria = criteriaRaw
      ?.map((entry) => (typeof entry === 'string' ? entry.trim() : undefined))
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    let updatedMsg: Message | undefined;
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const existingGrading =
        ((state.ui.tutorByMessageId || {})[assistantMessage.id]?.grading as Record<
          string,
          { score?: number; feedback: string; criteria?: string[] }
        >) || {};
      const result = attachTutorUiState({
        currentUi: state.ui.tutorByMessageId,
        currentMessages: list,
        messageId: assistantMessage.id,
        patch: {
          grading: {
            ...existingGrading,
            [rawId]: { feedback, score, criteria },
          },
        },
      });
      if (result.updatedMessage) updatedMsg = result.updatedMessage;
      return {
        ui: { ...state.ui, tutorByMessageId: result.nextUi },
        messages: { ...state.messages, [chatId]: result.nextMessages },
      } as Partial<StoreState>;
    });
    if (updatedMsg) {
      await persistMessage(updatedMsg).catch(() => undefined);
    }
    return { handled: true, usedContent: false };
  }

  if (name === 'add_to_deck') {
    try {
      const cards = Array.isArray(args['cards']) ? (args['cards'] as any[]) : [];
      if (cards.length > 0) await addCardsToDeck(chat.id, cards);
    } catch (error) {
      console.error('Failed to add cards to deck', error);
    }
    return { handled: true, usedContent: false };
  }

  if (name === 'srs_review') {
    const cnt = Math.min(
      Math.max(Number.parseInt(String(args['due_count'] ?? '10'), 10) || 10, 1),
      40,
    );
    let due: Record<string, unknown>[] = [];
    try {
      const cards = await getDueCards(chat.id, cnt);
      due = cards.map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        hint: c.hint,
        topic: c.topic,
        skill: c.skill,
      }));
    } catch (error) {
      console.error('Failed to fetch due cards', error);
    }
    return { handled: true, usedContent: false, payload: JSON.stringify(due) };
  }

  return { handled: false, usedContent: false };
}
