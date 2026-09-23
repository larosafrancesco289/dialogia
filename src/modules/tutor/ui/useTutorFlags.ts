import { useChatStore } from '@/lib/store';
import { selectCurrentChat } from '@/lib/store/selectors';
import { resolveTutorFlags, tutorAffordances, type TutorAffordances } from './tutorFlags';

export type { TutorAffordances } from './tutorFlags';

/** Every learner-facing tutor surface gates on this, so each arm shows only its own. */
export function useTutorAffordances(): TutorAffordances {
  return useChatStore(
    (s) => tutorAffordances(resolveTutorFlags(selectCurrentChat(s)?.settings.features.tutor)),
    (a, b) =>
      a.showMastery === b.showMastery &&
      a.correctMastery === b.correctMastery &&
      a.revisePlan === b.revisePlan,
  );
}
