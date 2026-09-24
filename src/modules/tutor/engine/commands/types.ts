// Module: tutor engine command types
// Responsibility: the commands `decide` takes, the context it runs in, and the structured error it refuses with.

import type { CardKind, IntakeQuestion, QuizItem, TutorEvent } from '@/modules/tutor/engine/events';
import type { TutorFlags } from '@/modules/tutor/engine/flags';
import type { PlanInput } from '@/modules/tutor/engine/plan';
import type { ObservationKind } from '@/modules/tutor/engine/rules';
import type { TutorState } from '@/modules/tutor/engine/state';

export type TutorErrorCode =
  | 'invalid_arguments'
  | 'wrong_phase'
  | 'card_open'
  | 'budget_exhausted'
  | 'not_editable'
  | 'no_plan'
  | 'invalid_plan'
  | 'no_proposal'
  | 'stale_proposal'
  | 'unknown_node'
  | 'no_current_topic'
  | 'topic_not_current'
  | 'topic_completed'
  | 'topic_not_completed'
  | 'already_current'
  | 'prerequisites_unmet'
  | 'not_ready'
  | 'learner_chooses'
  | 'open_misconceptions'
  | 'unknown_misconception'
  | 'already_resolved'
  | 'unknown_card'
  | 'unknown_item'
  | 'card_closed'
  | 'already_answered'
  | 'incomplete_answers'
  | 'invalid_choice'
  | 'nothing_to_change'
  | 'already_recorded'
  | 'weight_against_kind'
  | 'unknown_tool'
  // Raised by the store, not by `decide`: the chat is gone, or another tab won a race twice.
  | 'chat_deleted'
  | 'log_conflict';

export type TutorError = { code: TutorErrorCode; message: string; hint: string };

export type IntakeQuestionInput = Omit<IntakeQuestion, 'id'>;
export type QuizItemInput = Omit<QuizItem, 'id'>;
export type DiagnosticItemInput = QuizItemInput & { nodeId?: string };

export type TutorToolCommand =
  | { by: 'tutor'; type: 'ask_intake'; title?: string; questions: IntakeQuestionInput[] }
  | { by: 'tutor'; type: 'give_diagnostic'; topic: string; items: DiagnosticItemInput[] }
  | ({ by: 'tutor'; type: 'propose_plan'; rationale?: string } & PlanInput)
  | { by: 'tutor'; type: 'give_quiz'; title?: string; items: QuizItemInput[] }
  | {
      by: 'tutor';
      type: 'record_evidence';
      nodeId?: string;
      source: 'observation' | 'learner_said';
      kind: ObservationKind;
      weight?: number;
      /** The tutor led them to it; an upward weight counts for less. */
      helped?: boolean;
      note: string;
    }
  | {
      by: 'tutor';
      type: 'note_misconception';
      nodeId?: string;
      description: string;
      /** Which answer showed it; an earlier one leaves this reply's evidence standing. */
      shownBy?: 'latest_answer' | 'earlier_answer';
    }
  | {
      by: 'tutor';
      type: 'resolve_misconception';
      nodeId?: string;
      misconceptionId: string;
      note?: string;
    }
  | {
      by: 'tutor';
      type: 'complete_topic';
      nodeId?: string;
      how: 'mastered' | 'skipped';
      note?: string;
    }
  | { by: 'tutor'; type: 'start_topic'; nodeId: string };

export type LearnerCommand =
  | { by: 'learner'; type: 'answer_intake'; intakeId: string; responses: Record<string, string[]> }
  | {
      by: 'learner';
      type: 'answer_diagnostic';
      diagnosticId: string;
      answers: Record<string, number>;
    }
  | { by: 'learner'; type: 'answer_quiz_item'; quizId: string; itemId: string; choice: number }
  | { by: 'learner'; type: 'approve_plan'; proposalId: string }
  | { by: 'learner'; type: 'decline_plan'; proposalId: string; feedback?: string }
  | { by: 'learner'; type: 'start_topic'; nodeId: string }
  | { by: 'learner'; type: 'mark_known'; nodeId: string }
  | { by: 'learner'; type: 'skip_topic'; nodeId: string }
  | { by: 'learner'; type: 'reopen_topic'; nodeId: string }
  | { by: 'learner'; type: 'more_practice'; nodeId: string }
  | { by: 'learner'; type: 'adjust_mastery'; nodeId: string; setTo: number; note?: string }
  | { by: 'learner'; type: 'resolve_misconception'; nodeId?: string; misconceptionId: string }
  | { by: 'learner'; type: 'flag_review'; nodeId: string; flagged: boolean }
  | { by: 'learner'; type: 'dismiss_card'; card: CardKind; cardId: string };

export type TutorCommand = TutorToolCommand | LearnerCommand;

export type TutorToolName = TutorToolCommand['type'];

export type CommandContext = {
  chatId: string;
  at: number;
  idFactory: () => string;
  flags: TutorFlags;
  /** The assistant message the resulting events belong to. */
  messageId?: string;
};

export type DecideResult = { ok: true; events: TutorEvent[] } | { ok: false; error: TutorError };

export type StepResult =
  | { ok: true; events: TutorEvent[]; state: TutorState }
  | { ok: false; error: TutorError };
