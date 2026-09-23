import type { TutorSettings } from '@/lib/types';

export type TutorFlags = {
  /** The learner may change the plan (skip, reopen, start, discuss). */
  planEditable: boolean;
  /** The learner sees mastery: numbers, reasons, estimates. */
  learnerModelVisible: boolean;
  /** The learner may correct mastery. Implies visible. */
  learnerModelEditable: boolean;
};

/** What each learner-facing tutor surface may show under a set of flags. */
export type TutorAffordances = {
  /** Mastery numbers, meters and the evidence behind them. */
  showMastery: boolean;
  /** "Too high / Too low" and "Resolved": correcting the learner model. */
  correctMastery: boolean;
  /** Revise plan, "Not yet, more practice", "Change the path". */
  revisePlan: boolean;
};

/**
 * The study's conditions, resolved in one place. Unset means on, so an
 * ordinary chat gets every affordance. The learner model can be visible but
 * read-only, which separates inspecting it from negotiating it.
 */
export function resolveTutorFlags(tutor: TutorSettings | undefined): TutorFlags {
  const learnerModelVisible = tutor?.learnerModelVisible !== false;
  return {
    planEditable: tutor?.planEditable !== false,
    learnerModelVisible,
    learnerModelEditable: learnerModelVisible && tutor?.learnerModelEditable !== false,
  };
}

export function tutorAffordances(flags: TutorFlags): TutorAffordances {
  return {
    showMastery: flags.learnerModelVisible,
    correctMastery: flags.learnerModelEditable,
    revisePlan: flags.planEditable,
  };
}
