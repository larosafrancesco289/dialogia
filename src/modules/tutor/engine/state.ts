// Module: tutor engine state
// Responsibility: the shape `fold` produces, and read-only views over it.

import type { LearningPlan, LearningPlanNode, Misconception, TopicMastery } from '@/lib/types';
import type {
  DiagnosticItem,
  IntakeQuestion,
  QuizItem,
  StartingEstimate,
} from '@/modules/tutor/engine/events';
import { BUDGETS, MASTERY_PRIOR } from '@/modules/tutor/engine/rules';

export type TutorPhase = 'intake' | 'proposal' | 'teaching' | 'interlude' | 'complete';

export type AwaitingKind = 'intake' | 'diagnostic' | 'quiz' | 'proposal';

/** The card the learner has open, if any. Orthogonal to the phase. */
export type Awaiting = { kind: AwaitingKind; id: string };

type CardBase = { seq: number; messageId?: string; dismissed?: boolean };

export type IntakeRecord = CardBase & {
  intakeId: string;
  title?: string;
  questions: IntakeQuestion[];
  responses?: Record<string, string[]>;
};

export type DiagnosticRecord = CardBase & {
  diagnosticId: string;
  topic: string;
  items: DiagnosticItem[];
  answers?: Record<string, number>;
};

export type QuizRecord = CardBase & {
  quizId: string;
  nodeId: string;
  title?: string;
  items: QuizItem[];
  answers: Record<string, { choice: number; correct: boolean }>;
};

export type PendingProposal = {
  proposalId: string;
  plan: LearningPlan;
  rationale?: string;
  revision: boolean;
  startingEstimates?: Record<string, StartingEstimate>;
  seq: number;
  messageId?: string;
};

export type TutorState = {
  lastSeq: number;
  /** The approved plan. Node statuses are derived from topic events. */
  plan?: LearningPlan;
  proposal?: PendingProposal;
  lastDeclined?: { proposalId: string; feedback?: string };
  /** One entry per node of the approved plan. */
  mastery: Record<string, TopicMastery>;
  intakes: Record<string, IntakeRecord>;
  diagnostics: Record<string, DiagnosticRecord>;
  quizzes: Record<string, QuizRecord>;
  counts: {
    diagnostics: number;
    /** Quizzes given per topic since it was last reopened. */
    quizzesByNode: Record<string, number>;
  };
  phase: TutorPhase;
  awaiting?: Awaiting;
  currentNodeId?: string;
};

export function emptyTutorState(): TutorState {
  return {
    lastSeq: 0,
    mastery: {},
    intakes: {},
    diagnostics: {},
    quizzes: {},
    counts: { diagnostics: 0, quizzesByNode: {} },
    phase: 'intake',
  };
}

export function freshMastery(nodeId: string, at: number): TopicMastery {
  return {
    nodeId,
    confidence: MASTERY_PRIOR,
    interactions: 0,
    lastInteraction: at,
    evidence: [],
    misconceptions: [],
    needsReview: false,
  };
}

export function currentNode(state: TutorState): LearningPlanNode | undefined {
  return state.plan?.nodes.find((n) => n.id === state.currentNodeId);
}

export function confidenceOf(state: TutorState, nodeId: string): number {
  return state.mastery[nodeId]?.confidence ?? MASTERY_PRIOR;
}

export function openMisconceptions(state: TutorState, nodeId: string): Misconception[] {
  return (state.mastery[nodeId]?.misconceptions ?? []).filter((m) => !m.resolved);
}

export function quizFinished(quiz: QuizRecord): boolean {
  return quiz.items.every((item) => quiz.answers[item.id]);
}

export type Budgets = { quizzesLeft?: number; diagnosticsLeft: number };

/** What remains, counted from events. `quizzesLeft` is for the current topic. */
export function remainingBudgets(state: TutorState): Budgets {
  const diagnosticsLeft = Math.max(0, BUDGETS.diagnosticsPerSession - state.counts.diagnostics);
  const id = state.currentNodeId;
  if (!id) return { diagnosticsLeft };
  const used = state.counts.quizzesByNode[id] ?? 0;
  return { diagnosticsLeft, quizzesLeft: Math.max(0, BUDGETS.quizzesPerTopic - used) };
}
