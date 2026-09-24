import type { StoreState } from '@/lib/store/types';

/** The selected chat has an approved plan in its (loaded) tutor session. */
export function hasTutorPlan(state: StoreState): boolean {
  const chatId = state.selectedChatId;
  return !!chatId && !!state.tutorSessions[chatId]?.state.plan;
}
