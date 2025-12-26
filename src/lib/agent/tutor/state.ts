import type { TutorToolName } from '@/lib/agent/types';
import type { TutorToolUsageSnapshot, UiSnapshot } from '@/lib/agent/contracts';
import type { Chat, Message, MessageTutor, TutorResearchMode } from '@/lib/types';
import { getTutorToolsByPhase, getTutorToolsByTag } from '@/lib/agent/tools/metadata';

export type TutorPhase = 'intake' | 'diagnostic' | 'planning' | 'teaching' | 'practice' | 'review';

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
  const plan = chat.settings.learningPlan;
  const tutor = latestTutorPayload(messages, ui);

  if (!plan) {
    if (tutor?.diagnostic && tutor.diagnostic.status !== 'completed') return 'diagnostic';
    if (tutor?.planProposal && tutor.planProposal.status === 'pending') return 'planning';
    if (tutor?.questionnaire && tutor.questionnaire.status !== 'submitted') return 'intake';
    return 'intake';
  }

  const activeNode = plan.nodes.some((node) => node.status === 'in_progress');
  const completedCount = plan.nodes.filter((node) => node.status === 'completed').length;
  const hasPracticeWidget =
    (tutor?.mcq && tutor.mcq.length > 0) ||
    (tutor?.fillBlank && tutor.fillBlank.length > 0) ||
    (tutor?.openEnded && tutor.openEnded.length > 0) ||
    (tutor?.flashcards && tutor.flashcards.length > 0);

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

const QUIZ_TOOLS = new Set<TutorToolName>(getTutorToolsByTag('quiz'));
const PLAN_TOOLS = new Set<TutorToolName>(getTutorToolsByTag('plan'));
const LEARNER_MODEL_TOOLS = new Set<TutorToolName>(getTutorToolsByTag('learnerModel'));
const THESIS_CORE_TOOLS = new Set<TutorToolName>(getTutorToolsByTag('thesisCore'));
const BASELINE_TOOLS: TutorToolName[] = getTutorToolsByTag('baseline');
const DIAGNOSTIC_TOOLS = new Set<TutorToolName>(getTutorToolsByTag('diagnostic'));

export type TutorToolFilters = {
  thesisMode?: boolean;
  researchMode?: TutorResearchMode;
  allowPlanTools?: boolean;
  allowLearnerModel?: boolean;
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
  return applyTutorFilters(getTutorToolsByPhase(phase), phase, filters);
}

export function isTutorToolAllowedInPhase(
  name: TutorToolName,
  phase: TutorPhase,
  filters?: TutorToolFilters,
): boolean {
  return allowedTutorToolsForPhase(phase, filters).includes(name);
}

function applyTutorFilters(
  base: TutorToolName[],
  phase: TutorPhase,
  filters?: TutorToolFilters,
): TutorToolName[] {
  let tools = [...base];
  const researchMode = filters?.researchMode;

  if (researchMode === 'baseline_chat') {
    tools = BASELINE_TOOLS.slice();
  }

  if (researchMode === 'plan_only' || filters?.allowLearnerModel === false) {
    tools = tools.filter((name) => !LEARNER_MODEL_TOOLS.has(name));
  }

  if (researchMode === 'model_only' || filters?.allowPlanTools === false) {
    tools = tools.filter((name) => !PLAN_TOOLS.has(name));
  }

  if (filters?.diagnosticsRemaining === 0) {
    tools = tools.filter((name) => !DIAGNOSTIC_TOOLS.has(name));
  }

  const hasQuizAllowance = filters?.quizzesRemaining == null ? true : filters.quizzesRemaining > 0;
  if (!hasQuizAllowance) {
    tools = tools.filter((name) => !QUIZ_TOOLS.has(name));
  }

  if (filters?.thesisMode) {
    const allowReadinessChecks = hasQuizAllowance && phase !== 'intake' && phase !== 'planning';
    tools = tools.filter((name) => {
      if (THESIS_CORE_TOOLS.has(name)) return true;
      if (!allowReadinessChecks) return false;
      return name === 'quiz_mcq';
    });
  }

  return Array.from(new Set(tools));
}

const DEFAULT_TOOL_BUDGET = {
  maxToolsPerTurn: 3,
  maxQuizzesPerNode: 1,
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
    ...(chat.settings.tutor_tool_budget || {}),
  };
  const usage: TutorToolUsageSnapshot | undefined = ui?.tutor.toolUsageByChatId?.[chat.id];
  const activeKey = activeNodeId || '__global__';
  const quizzesUsed = usage?.mcqByNode?.[activeKey] ?? 0;
  const diagnosticsUsed = usage?.diagnosticsUsed ?? 0;
  const researchMode =
    chat.settings.tutor_research_mode || ui?.tutor.researchMode || 'plan_plus_model';
  const thesisMode = chat.settings.tutor_thesis_mode ?? ui?.tutor.thesisMode ?? false;

  return {
    thesisMode,
    researchMode,
    allowPlanTools: researchMode !== 'model_only',
    allowLearnerModel: chat.settings.enableLearnerModel !== false && researchMode !== 'plan_only',
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
