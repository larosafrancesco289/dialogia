import type { TutorPhase } from '@/lib/agent/tutor/types';
import type { TutorToolUsageSnapshot, UiSnapshot } from '@/lib/contracts/ui';
import type { Chat, Message, MessageTutor } from '@/lib/types';
import {
  getTutorToolsByPhase,
  getTutorToolsByTag,
  type TutorToolName,
} from '@/lib/agent/tools/tutor/register';

export type { TutorPhase } from '@/lib/agent/tutor/types';

function latestTutorPayload(messages: Message[], ui?: UiSnapshot): MessageTutor | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    if (msg.tutor) return msg.tutor;
    const uiTutor = ui?.tutor.byMessageId?.[msg.id];
    if (uiTutor) return uiTutor;
  }
  return undefined;
}

export function getTutorPhase(chat: Chat, messages: Message[], ui?: UiSnapshot): TutorPhase {
  const plan = chat.settings.features.tutor.learningPlan;
  const tutor = latestTutorPayload(messages, ui);

  if (!plan) {
    if (tutor?.diagnostic && tutor.diagnostic.status !== 'completed') return 'diagnostic';
    if (tutor?.planProposal && tutor.planProposal.status === 'pending') return 'planning';
    if (tutor?.questionnaire && tutor.questionnaire.status !== 'submitted') return 'intake';
    return 'intake';
  }

  const activeNode = plan.nodes.some((node) => node.status === 'in_progress');
  const completedCount = plan.nodes.filter((node) => node.status === 'completed').length;
  const hasPracticeWidget = tutor?.mcq && tutor.mcq.length > 0;

  if (!activeNode) {
    if (completedCount > 0 && completedCount === plan.nodes.length) return 'review';
    if (tutor?.planProposal && tutor.planProposal.status === 'pending') return 'planning';
    if (tutor?.diagnostic && tutor.diagnostic.status !== 'completed') return 'diagnostic';
    return 'planning';
  }

  if (tutor?.diagnostic && tutor.diagnostic.status !== 'completed') return 'diagnostic';
  if (hasPracticeWidget) return 'practice';
  if (completedCount > 0 && completedCount === plan.nodes.length) return 'review';
  return 'teaching';
}

// Resolved lazily: the registry is populated by module registration, not at import time.
const quizTools = () => new Set<TutorToolName>(getTutorToolsByTag('quiz'));
const learnerModelTools = () => new Set<TutorToolName>(getTutorToolsByTag('learnerModel'));
const diagnosticTools = () => new Set<TutorToolName>(getTutorToolsByTag('diagnostic'));

export type TutorToolFilters = {
  allowLearnerModel?: boolean;
  allowUpdatePlan?: boolean;
  planExists?: boolean;
  disablePlanGeneration?: boolean;
  quizzesRemaining?: number;
  diagnosticsRemaining?: number;
};

export type TutorToolPolicy = TutorToolFilters & {
  maxToolsPerTurn: number;
};

export function allowedTutorToolsForPhase(
  phase: TutorPhase,
  filters?: TutorToolFilters,
): TutorToolName[] {
  return applyTutorFilters(getTutorToolsByPhase(phase), filters);
}

export function isTutorToolAllowedInPhase(
  name: TutorToolName,
  phase: TutorPhase,
  filters?: TutorToolFilters,
): boolean {
  return allowedTutorToolsForPhase(phase, filters).includes(name);
}

function applyTutorFilters(base: TutorToolName[], filters?: TutorToolFilters): TutorToolName[] {
  let tools = [...base];
  const planExists = filters?.planExists === true;

  if (filters?.allowLearnerModel === false) {
    tools = tools.filter((name) => !learnerModelTools().has(name));
  }

  if (filters?.disablePlanGeneration) {
    if (!planExists) {
      tools = tools.filter((name) => name !== 'learning_plan');
    }
  }

  // Filter learning_plan based on planEditable condition (for updates only)
  if (filters?.allowUpdatePlan === false) {
    if (planExists) {
      tools = tools.filter((name) => name !== 'learning_plan');
    }
  }

  if (filters?.diagnosticsRemaining === 0) {
    tools = tools.filter((name) => !diagnosticTools().has(name));
  }

  const hasQuizAllowance = filters?.quizzesRemaining == null ? true : filters.quizzesRemaining > 0;
  if (!hasQuizAllowance) {
    tools = tools.filter((name) => !quizTools().has(name));
  }

  return Array.from(new Set(tools));
}

const DEFAULT_TOOL_BUDGET = {
  maxToolsPerTurn: 3,
  maxQuizzesPerNode: 3,
  maxDiagnosticsPerSession: 1,
};

export function deriveTutorToolPolicy(args: {
  chat: Chat;
  ui?: UiSnapshot;
  activeNodeId?: string | null;
}): TutorToolPolicy {
  const { chat, ui, activeNodeId } = args;
  const budget = {
    ...DEFAULT_TOOL_BUDGET,
    ...(chat.settings.features.tutor.toolBudget || {}),
  };
  const usage: TutorToolUsageSnapshot | undefined = ui?.tutor.toolUsageByChatId?.[chat.id];
  const activeKey = activeNodeId || '__global__';
  const quizzesUsed = usage?.mcqByNode?.[activeKey] ?? 0;
  const diagnosticsUsed = usage?.diagnosticsUsed ?? 0;
  const planExists = !!chat.settings.features.tutor.learningPlan;

  return {
    allowLearnerModel: chat.settings.features.tutor.enableLearnerModel !== false,
    allowUpdatePlan: chat.settings.features.tutor.planEditable !== false,
    planExists,
    disablePlanGeneration: chat.settings.features.tutor.disablePlanGeneration === true,
    quizzesRemaining:
      budget.maxQuizzesPerNode == null
        ? undefined
        : Math.max(0, budget.maxQuizzesPerNode - quizzesUsed),
    diagnosticsRemaining:
      budget.maxDiagnosticsPerSession == null
        ? undefined
        : Math.max(0, budget.maxDiagnosticsPerSession - diagnosticsUsed),
    maxToolsPerTurn: budget.maxToolsPerTurn ?? DEFAULT_TOOL_BUDGET.maxToolsPerTurn,
  };
}

export type TutorToolEligibility = {
  allowedTutorTools: Set<TutorToolName>;
  toolPolicy: TutorToolPolicy;
};

export function getTutorToolEligibility(args: {
  chat: Chat;
  ui?: UiSnapshot;
  phase: TutorPhase;
  activeNodeId?: string | null;
}): TutorToolEligibility {
  const { chat, ui, phase, activeNodeId } = args;
  const toolPolicy = deriveTutorToolPolicy({ chat, ui, activeNodeId });
  const allowedTutorTools = new Set(allowedTutorToolsForPhase(phase, toolPolicy));
  return { allowedTutorTools, toolPolicy };
}
