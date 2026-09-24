// Module: tutor ledger lines
// Responsibility: the words of the ledger lines a learner's turn-taking actions leave in the
// transcript. Pure, so the UI and the simulation harness send exactly the same lines.

import { inSentence } from '@/modules/tutor/lib/text';

const score = (right: number, total: number) => `${right} of ${total} right`;

export const LEDGER = {
  intakeAnswered: () => 'Answered the intake questions',
  quizFinished: (right: number, total: number) => `Answered the quiz: ${score(right, total)}`,
  diagnosticFinished: (right: number, total: number) =>
    `Finished the diagnostic: ${score(right, total)}`,
  planApproved: () => 'Approved the plan',
  planDeclined: (feedback: string) => `Asked for changes to the plan: ${feedback.trim()}`,
  goingOn: (topic: string) => `Going on to ${inSentence(topic)}`,
  morePractice: (topic: string) => `Asked for more practice on ${inSentence(topic)}`,
  startedTopic: (topic: string) => `Chose ${inSentence(topic)} next`,
  reopenedTopic: (topic: string) => `Took up ${inSentence(topic)} again`,
} as const;
