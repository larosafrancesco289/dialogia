// Module: tutor store access
// Responsibility: reach the tutor slice through a core getter. Core hands turn code a
// getter typed with core fields only; the composed store behind it carries this slice.

import type {
  TutorSession,
  TutorSliceState,
  TutorStoreActions,
} from '@/modules/tutor/store/tutorSlice';

/** The chat's tutor session as the store holds it at this moment, if it has one. */
export function currentTutorSession(
  get: (() => unknown) | undefined,
  chatId: string,
): TutorSession | undefined {
  const state = get?.() as Partial<TutorSliceState> | undefined;
  return state?.tutorSessions?.[chatId];
}

/** The tutor's actions, or undefined when the store was built without the tutor slice. */
export function tutorStore(
  get: (() => unknown) | undefined,
): Pick<TutorStoreActions, 'ensureTutorSession' | 'dispatchTutor'> | undefined {
  const state = get?.() as Partial<TutorStoreActions> | undefined;
  if (typeof state?.dispatchTutor !== 'function') return undefined;
  if (typeof state.ensureTutorSession !== 'function') return undefined;
  return state as Pick<TutorStoreActions, 'ensureTutorSession' | 'dispatchTutor'>;
}
