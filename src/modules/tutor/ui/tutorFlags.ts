import { resolveTutorFlags, type TutorFlags } from '@/modules/tutor/engine';

export { resolveTutorFlags, type TutorFlags };

/** What each learner-facing tutor surface may show under a set of flags. */
export type TutorAffordances = {
  /** Mastery numbers, meters and the evidence behind them. */
  showMastery: boolean;
  /** "Too high / Too low" and "Resolved": correcting the learner model. */
  correctMastery: boolean;
  /** Revise plan, "Not yet, more practice", "Change the path". */
  revisePlan: boolean;
};

export function tutorAffordances(flags: TutorFlags): TutorAffordances {
  return {
    showMastery: flags.learnerModelVisible,
    correctMastery: flags.learnerModelEditable,
    revisePlan: flags.planEditable,
  };
}
