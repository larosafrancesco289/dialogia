import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { effectiveEvents, type TutorEvent } from '@/modules/tutor/engine';

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

const cardMessages = new WeakMap<readonly TutorEvent[], Set<string>>();

/** The ids of the replies that put a card up, once per log. */
function messagesWithCards(events: readonly TutorEvent[]): Set<string> {
  const cached = cardMessages.get(events);
  if (cached) return cached;
  const ids = new Set<string>();
  for (const event of effectiveEvents(events)) {
    if (!event.messageId) continue;
    if (
      event.type === 'intake_asked' ||
      event.type === 'diagnostic_given' ||
      event.type === 'quiz_given' ||
      event.type === 'plan_proposed' ||
      event.type === 'proposal_imported'
    ) {
      ids.add(event.messageId);
    }
  }
  cardMessages.set(events, ids);
  return ids;
}

/** A reply that put a card in front of the learner is not empty, words or not. */
export function messageCarriesTutorCard(state: StoreState, message: Message): boolean {
  if (message.role !== 'assistant') return false;
  const events = state.tutorSessions[message.chatId]?.events;
  return !!events?.length && messagesWithCards(events).has(message.id);
}
