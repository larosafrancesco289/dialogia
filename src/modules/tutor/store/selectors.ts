import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import type { StoreState } from '@/lib/store/types';

/** The selected chat has an approved plan in its (loaded) tutor session. */
export function hasTutorPlan(state: StoreState): boolean {
  const chatId = state.selectedChatId;
  return !!chatId && !!state.tutorSessions[chatId]?.state.plan;
}

/**
 * The chat's tutor log follows its transcript: the tutor is on for it, or its
 * (loaded) log has events. Its replies are then redone only in the latest
 * exchange, so retracting a reply never leaves a later ledger line or reply
 * describing what was taken back.
 */
export function tutorFollowsTranscript(state: StoreState, chatId: string): boolean {
  if ((state.tutorSessions[chatId]?.events.length ?? 0) > 0) return true;
  const chat = state.chats.find((c) => c.id === chatId);
  return !!chat && isTutorRuntimeEnabled(state.ui, chat);
}
