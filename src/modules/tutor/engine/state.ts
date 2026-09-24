// Module: tutor engine state
// Responsibility: the shape `fold` produces, and read-only views over it.

import type { LearningPlan, LearningPlanNode, Misconception, TopicMastery } from '@/lib/types';
import type {
  DiagnosticItem,
  IntakeQuestion,
  QuizItem,
  StartingEstimate,
} from '@/modules/tutor/engine/events';
import {
  BUDGETS,
  MASTERY_EVIDENCE_MIN,
  MASTERY_PRIOR,
  READY,
  STARTING_ESTIMATE_MAX,
  STARTING_ESTIMATE_SAID_MAX,
} from '@/modules/tutor/engine/rules';

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

/**
 * What the tutor's latest reply has recorded so far, per topic: its own
 * evidence (the estimate before and after it) and the misconceptions it noted.
 * One reply records at most one piece of evidence per topic, and a reply that
 * notes a misconception the answer it responds to showed gains nothing on its topic.
 */
export type ReplyRecord = {
  messageId: string;
  /** By topic: the reply's evidence event, and the estimate before it and after the reply's last. */
  evidence: Record<string, { eventId: string; before: number; after: number }>;
  /** Topics with a misconception the answer this reply responds to showed; not an earlier answer's. */
  misconceptions: string[];
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
    /**
     * How many evidence entries a topic had when it was last reopened: what
     * came before shows what the learner could do then, not now.
     */
    evidenceAtReopen: Record<string, number>;
  };
  phase: TutorPhase;
  awaiting?: Awaiting;
  currentNodeId?: string;
  /** The reply that last completed a topic, so that reply cannot also start the next one. */
  lastCompletedBy?: string;
  reply?: ReplyRecord;
};

export function emptyTutorState(): TutorState {
  return {
    lastSeq: 0,
    mastery: {},
    intakes: {},
    diagnostics: {},
    quizzes: {},
    counts: { diagnostics: 0, quizzesByNode: {}, evidenceAtReopen: {} },
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

/** Whether the learner has finished a diagnostic in this session. */
export function diagnosed(state: TutorState): boolean {
  return Object.values(state.diagnostics).some((d) => !!d.answers);
}

/** How high a proposal may start a topic: higher once a diagnostic has tested the learner. */
export function startingEstimateCap(state: TutorState): number {
  return diagnosed(state) ? STARTING_ESTIMATE_MAX : STARTING_ESTIMATE_SAID_MAX;
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

/** The record of `messageId`'s reply so far, or undefined when it has recorded nothing yet. */
export function replyRecord(state: TutorState, messageId: string | undefined) {
  return messageId && state.reply?.messageId === messageId ? state.reply : undefined;
}

/**
 * Whether the log holds a mistake on the topic from before `messageId`'s
 * reply: a wrong quiz or diagnostic answer, or an observation that lowered
 * the estimate. A misconception said to show in an earlier answer must have
 * such an answer behind it; otherwise the answer the reply responds to is the
 * only one that could have shown it.
 */
export function earlierMistake(
  state: TutorState,
  nodeId: string,
  messageId: string | undefined,
): boolean {
  const own = replyRecord(state, messageId)?.evidence[nodeId]?.eventId;
  return (state.mastery[nodeId]?.evidence ?? []).some(
    (entry) => entry.weight < 0 && (!own || entry.eventId !== own),
  );
}

/**
 * Evidence recorded in this session that the learner can do it: a correct
 * quiz or diagnostic answer, or something right the tutor observed, since the
 * topic was last reopened. Not a starting estimate, a placement, a learner's
 * own correction, history imported from before the log, a mistake, a partly
 * right answer, an answer whose gain was taken back for showing a
 * misconception, or what they showed before the topic had to be reopened.
 * Mastery must rest on this.
 */
export function demonstratedEvidence(state: TutorState, nodeId: string): number {
  const since = state.counts.evidenceAtReopen[nodeId] ?? 0;
  const evidence = state.mastery[nodeId]?.evidence ?? [];
  const takenBack = new Set(
    evidence.filter((entry) => entry.kind === 'misconception').map((entry) => entry.ref?.eventId),
  );
  return evidence
    .slice(since)
    .filter(
      (entry) =>
        !!entry.eventId &&
        !takenBack.has(entry.eventId) &&
        entry.kind !== 'placement' &&
        entry.kind !== 'partial' &&
        entry.weight > 0 &&
        (entry.source === 'quiz' ||
          entry.source === 'diagnostic' ||
          entry.source === 'observation'),
    ).length;
}

/**
 * Whether the topic may be completed as mastered: at READY, on enough of the
 * learner's own work since it was opened, with no open misconception. The
 * engine's one readiness rule; `complete_topic` refuses with a reason for
 * whichever part is missing.
 */
export function readyToComplete(state: TutorState, nodeId: string): boolean {
  return (
    confidenceOf(state, nodeId) >= READY &&
    demonstratedEvidence(state, nodeId) >= MASTERY_EVIDENCE_MIN &&
    openMisconceptions(state, nodeId).length === 0
  );
}
