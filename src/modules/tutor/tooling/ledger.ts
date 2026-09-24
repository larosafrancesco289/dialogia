// Module: tutor tooling ledger
// Responsibility: the short factual messages the UI sends on the learner's behalf after a
// card or chapter-break action, word for word, so the simulated tutor reads what a real one does.

import type { Message } from '@/lib/types';

export type LedgerLine = { content: string; metadata?: Message['metadata'] };

// TODO(tutor B2): the UI is moving these to visible ledger lines (`Message.ledger`). Until
// that lands they go out as the hidden user messages the cards send today; mirror the UI's
// flag here once it exists. Sources: McqCard, DiagnosticCard, QuestionnaireCard,
// PlanProposalCard and usePlanCallbacks under src/modules/tutor.
const line = (content: string, kind: string): LedgerLine => ({
  content,
  metadata: { hiddenFromUser: true, kind },
});

export const LEDGER = {
  intakeAnswered: () => line('Answered the intake questions.', 'tutor_questionnaire_submission'),
  diagnosticFinished: (right: number, total: number) =>
    line(`Finished the diagnostic: ${right} of ${total} right.`, 'tutor_diagnostic_completion'),
  quizAnswered: (right: number, total: number) =>
    line(`Answered the quiz: ${right} of ${total} right.`, 'tutor_quiz_completion'),
  planApproved: () => line('Approved the plan.', 'tutor_plan_adoption'),
  // The decline goes out as an ordinary message: the learner wrote the feedback.
  planDeclined: (feedback: string): LedgerLine => ({ content: `Declined the plan: ${feedback}` }),
  topicStarted: (name: string) => line(`Started ${name}.`, 'tutor_start_lesson'),
  morePractice: (name: string) =>
    line(`Asked for more practice on ${name}.`, 'tutor_more_practice'),
};
