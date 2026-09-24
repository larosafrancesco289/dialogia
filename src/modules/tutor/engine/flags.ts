// Module: tutor engine flags
// Responsibility: the study conditions that gate learner commands and tutor tools.

import type { TutorSettings } from '@/lib/types';

export type TutorFlags = {
  /** The learner may change the plan: decline, skip, reopen, jump, mark known. */
  planEditable: boolean;
  /** The learner sees mastery numbers and the evidence behind them. */
  learnerModelVisible: boolean;
  /** The learner may correct mastery. Implies visible. */
  learnerModelEditable: boolean;
};

/** @internal The engine's tests and harnesses start from these. */
export const DEFAULT_TUTOR_FLAGS: TutorFlags = {
  planEditable: true,
  learnerModelVisible: true,
  learnerModelEditable: true,
};

/**
 * Reads `chat.settings.features.tutor`. Unset means on, so an ordinary chat
 * gets every control. The keys are shared with the `research` branch.
 */
export function resolveTutorFlags(
  tutor:
    | Pick<TutorSettings, 'planEditable' | 'learnerModelVisible' | 'learnerModelEditable'>
    | undefined,
): TutorFlags {
  const learnerModelVisible = tutor?.learnerModelVisible !== false;
  return {
    planEditable: tutor?.planEditable !== false,
    learnerModelVisible,
    learnerModelEditable: learnerModelVisible && tutor?.learnerModelEditable !== false,
  };
}
