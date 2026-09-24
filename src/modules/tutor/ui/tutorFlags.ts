import { resolveTutorFlags, type TutorFlags, type TutorPhase } from '@/modules/tutor/engine';

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

export type SeamChoices = {
  /** "Go on: …": follows the plan, so it needs only a next topic to go to. */
  goOn: boolean;
  /** "More practice" (reopens the topic) and "Change the path" both change the plan. */
  negotiate: boolean;
};

/** What a live chapter break offers, under the flags and the session's phase. */
export function seamChoices(
  affordances: TutorAffordances,
  seam: { phase: TutorPhase; hasNext: boolean },
): SeamChoices {
  return {
    goOn: seam.phase === 'interlude' && seam.hasNext,
    negotiate: affordances.revisePlan,
  };
}
