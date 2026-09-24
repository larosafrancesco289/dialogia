// Module: tutor ledger lines
// Responsibility: the words of the ledger lines a learner's turn-taking actions leave in the
// transcript. Pure, so the UI and the simulation harness send exactly the same lines.

// A topic's name is a title the tutor wrote ("Trace the search steps", "Bayes'
// rule"), so it follows a colon rather than being bent to fit mid-sentence.

const score = (right: number, total: number) => `${right} of ${total} right`;

export const LEDGER = {
  intakeAnswered: () => 'Answered the intake questions',
  quizFinished: (right: number, total: number) => `Answered the quiz: ${score(right, total)}`,
  diagnosticFinished: (right: number, total: number) =>
    `Finished the diagnostic: ${score(right, total)}`,
  planApproved: () => 'Approved the plan',
  planDeclined: (feedback: string) => `Asked for changes to the plan: ${feedback.trim()}`,
  goingOn: (topic: string) => `Going on: ${topic}`,
  morePractice: (topic: string) => `Asked for more practice: ${topic}`,
  startedTopic: (topic: string) => `Chose what comes next: ${topic}`,
  reopenedTopic: (topic: string) => `Took a topic up again: ${topic}`,
} as const;
