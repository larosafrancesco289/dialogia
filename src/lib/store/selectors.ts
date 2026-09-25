// Module: store/selectors
// Responsibility: Shared read-only selectors for Zustand store consumers.

import type { Chat } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import { readNextOverrides } from '@/lib/ui/next';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { NATIVE_SEARCH_MODE } from '@/lib/types/enums';

export const selectCurrentChat = (state: StoreState) => {
  const chatId = state.selectedChatId;
  if (!chatId) return undefined;
  return state.chats.find((chat) => chat.id === chatId);
};

export const selectMessagesForChat = (chatId?: string) => (state: StoreState) =>
  chatId ? getMessagesForChat(state, chatId) : [];

export const selectChatMessagesLoaded = (chatId?: string) => (state: StoreState) =>
  !chatId || !!state.loadedMessageChatIds[chatId];

export const selectMessagesForCurrentChat = (state: StoreState) => {
  const chatId = state.selectedChatId;
  return chatId ? getMessagesForChat(state, chatId) : [];
};

export const selectIsStreaming = (state: StoreState) => {
  const chatId = state.selectedChatId;
  if (!chatId) return false;
  return (state.ui.activeTurnByChatId[chatId] ?? 0) > 0;
};

export const selectIsStreamingForChat = (chatId?: string) => (state: StoreState) => {
  if (!chatId) return false;
  return (state.ui.activeTurnByChatId[chatId] ?? 0) > 0;
};

const NO_REPLIES: string[] = [];

/** Replies another tab says it is writing in this chat. */
export const selectRepliesInOtherTab = (chatId?: string) => (state: StoreState) =>
  (chatId && state.repliesInOtherTabs[chatId]) || NO_REPLIES;

export const selectIsWritingInOtherTab = (state: StoreState) =>
  selectRepliesInOtherTab(state.selectedChatId)(state).length > 0;

const resolveTutorEnabled = (state: StoreState, chat?: Chat) => {
  if (chat) return isTutorRuntimeEnabled(state.ui, chat);
  const overrides = readNextOverrides(state.ui);
  return (
    !!state.ui.flags.experimentalTutor && (!!state.ui.tutor?.forceMode || !!overrides.tutorMode)
  );
};

export const selectIsTutorEnabled = (state: StoreState) =>
  resolveTutorEnabled(state, selectCurrentChat(state));

export const selectIsTutorEnabledForChat = (chatId?: string) => (state: StoreState) =>
  resolveTutorEnabled(state, chatId ? state.chats.find((chat) => chat.id === chatId) : undefined);

export const selectNotice = (state: StoreState) => state.ui.notice;
export const selectNoticeTone = (state: StoreState) => state.ui.noticeTone ?? 'error';

export const selectNextOverrides = (state: StoreState) => readNextOverrides(state.ui);

export const selectResolvedModelId =
  (fallbackId?: string) =>
  (state: StoreState): string | undefined => {
    const overrides = readNextOverrides(state.ui);
    const chat = selectCurrentChat(state);
    return overrides.modelId ?? chat?.settings.modelId ?? fallbackId;
  };

export const selectResolvedTurnSettings = (state: StoreState) => {
  const chat = selectCurrentChat(state);
  if (!chat) return undefined;
  return resolveTurnSettings({ chat, ui: state.ui, modelIndex: state.modelIndex });
};

export const selectSearchEnabled = (state: StoreState) => {
  const resolved = selectResolvedTurnSettings(state);
  if (resolved) return resolved.searchEnabled;
  return !!selectNextOverrides(state).search?.enabled;
};

export const selectSearchProvider = (state: StoreState) => {
  const resolved = selectResolvedTurnSettings(state);
  if (resolved) return resolved.searchProvider;
  return selectNextOverrides(state).search?.provider ?? NATIVE_SEARCH_MODE;
};
