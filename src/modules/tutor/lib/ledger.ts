// Module: tutor ledger lines
// Responsibility: the words of the ledger lines a learner's turn-taking actions leave in the
// transcript. Pure, so the UI and the simulation harness send exactly the same lines.

import { asTheirIdea } from '@/modules/tutor/lib/text';
import { t } from '@/modules/tutor/i18n';

// A topic's name is a title the tutor wrote ("Trace the search steps", "Bayes'
// rule"), so it follows a colon rather than being bent to fit mid-sentence.

// The lines are the learner's own words in the transcript, so they are written
// in the language shown when the action is taken (and the tutor reads them so).
const score = (right: number, total: number) => t('ledger.score', { right, count: total });

export const LEDGER = {
  intakeAnswered: () => t('ledger.intake'),
  quizFinished: (right: number, total: number) => t('ledger.quiz', { score: score(right, total) }),
  diagnosticFinished: (right: number, total: number) =>
    t('ledger.diagnostic', { score: score(right, total) }),
  planApproved: () => t('ledger.approved'),
  planDeclined: (feedback: string) => t('ledger.declined', { feedback: feedback.trim() }),
  goingOn: (topic: string) => t('ledger.goingOn', { topic }),
  morePractice: (topic: string) => t('ledger.morePractice', { topic }),
  startedTopic: (topic: string) => t('ledger.started', { topic }),
  reopenedTopic: (topic: string) => t('ledger.reopened', { topic }),
  markedKnown: (topic: string) => t('ledger.markedKnown', { topic }),
  contested: (direction: 'high' | 'low', topic: string) =>
    t(direction === 'high' ? 'ledger.tooHigh' : 'ledger.tooLow', { topic }),
  clearedUp: (belief: string) => t('ledger.clearedUp', { idea: asTheirIdea(belief) }),
} as const;
