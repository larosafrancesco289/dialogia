// Module: tutor engine events
// Responsibility: the append-only facts a tutor session is folded from.

import type { EvidenceSource, LearnerModel, LearningPlan } from '@/lib/types';
import type { EvidenceKind } from '@/modules/tutor/engine/rules';

export type EventActor = 'tutor' | 'learner' | 'system';

export type EventBase = {
  id: string;
  chatId: string;
  /** Position in the chat's log, from 1. */
  seq: number;
  at: number;
  by: EventActor;
  /** The assistant message the event belongs to: the turn that produced it, or the card acted on. */
  messageId?: string;
};

export type IntakeOption = { label: string; description?: string };

export type IntakeQuestion = {
  id: string;
  question: string;
  category?: string;
  allowMultiple?: boolean;
  options: IntakeOption[];
};

/** Items carry their answer key. It stays in the log and never goes back to the model. */
export type QuizItem = {
  id: string;
  question: string;
  choices: string[];
  correct: number;
  explanation?: string;
};

/** Legacy diagnostics may lack a key; such items are shown but not scored. */
export type DiagnosticItem = Omit<QuizItem, 'correct'> & { correct?: number; nodeId?: string };

export type CompletionHow = 'mastered' | 'known' | 'skipped';

export type CardKind = 'intake' | 'diagnostic' | 'quiz';

export type EvidenceRef = { quizId?: string; diagnosticId?: string; itemId?: string };

type Payloads = {
  /** One-time import of pre-rebuild state. */
  legacy_imported: {
    plan?: LearningPlan;
    learnerModel?: LearnerModel;
    proposal?: { proposalId: string; plan: LearningPlan; rationale?: string };
  };
  intake_asked: { intakeId: string; title?: string; questions: IntakeQuestion[] };
  /** Keyed by question id; each value holds chosen labels and any typed answer. */
  intake_answered: { intakeId: string; responses: Record<string, string[]> };
  diagnostic_given: { diagnosticId: string; topic: string; items: DiagnosticItem[] };
  diagnostic_answered: { diagnosticId: string; answers: Record<string, number> };
  plan_proposed: {
    proposalId: string;
    plan: LearningPlan;
    rationale?: string;
    revision: boolean;
  };
  plan_approved: { proposalId: string };
  plan_declined: { proposalId: string; feedback?: string };
  topic_started: { nodeId: string };
  topic_completed: { nodeId: string; how: CompletionHow; note?: string };
  topic_reopened: { nodeId: string };
  quiz_given: { quizId: string; nodeId: string; title?: string; items: QuizItem[] };
  quiz_answered: { quizId: string; itemId: string; choice: number; correct: boolean };
  evidence_recorded: {
    nodeId: string;
    source: EvidenceSource;
    kind: EvidenceKind;
    weight?: number;
    setTo?: number;
    note: string;
    ref?: EvidenceRef;
  };
  misconception_noted: { nodeId: string; misconceptionId: string; description: string };
  misconception_resolved: { nodeId: string; misconceptionId: string; note?: string };
  review_flagged: { nodeId: string; flagged: boolean };
  /** The learner closed a card without finishing it. */
  card_dismissed: { card: CardKind; cardId: string };
  /**
   * An assistant reply was replaced (regenerated) or removed. Every earlier
   * event carrying its message id stops counting: the tutor's own events of
   * that turn, and the learner's answers to its cards. Only `fold` honours
   * this; see `effectiveEvents`.
   */
  reply_retracted: { replyId: string };
  /**
   * A proposal from before the event log that the learner had already
   * answered (or that a later one replaced). History only: it lets an old
   * transcript render its plan card, and changes no state.
   */
  proposal_imported: {
    proposalId: string;
    plan: LearningPlan;
    rationale?: string;
    status: 'approved' | 'declined' | 'replaced';
  };
};

export type TutorEventType = keyof Payloads;

export type TutorEventOf<T extends TutorEventType> = EventBase & { type: T } & Payloads[T];

export type TutorEvent = { [K in TutorEventType]: TutorEventOf<K> }[TutorEventType];

/** An event before the log stamps it: what `decide` builds for each fact. */
export type TutorEventDraft = {
  [K in TutorEventType]: { type: K } & Payloads[K];
}[TutorEventType];
