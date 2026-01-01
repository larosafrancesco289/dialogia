// Module: store/selectors
// Responsibility: Shared read-only selectors for Zustand store consumers.

import type { StoreState } from '@/lib/store/types';
import type { ModelCapabilityFlags } from '@/lib/models';
import { readNextOverrides } from '@/lib/ui/next';
import { normalizeParallelModels } from '@/lib/store/normalize';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { getClientTier } from '@/lib/auth/tier.client';
import { getMessagesForChat } from '@/lib/messages/indexing';

export const selectCurrentChat = (state: StoreState) => {
  const chatId = state.selectedChatId;
  if (!chatId) return undefined;
  return state.chats.find((chat) => chat.id === chatId);
};

export const selectSelectedChatId = (state: StoreState) => state.selectedChatId;

export const selectMessagesForChat = (chatId?: string) => (state: StoreState) =>
  chatId ? getMessagesForChat(state, chatId) : [];

export const selectMessagesForCurrentChat = (state: StoreState) => {
  const chatId = state.selectedChatId;
  return chatId ? getMessagesForChat(state, chatId) : [];
};

export const selectLastMessageId = (state: StoreState) => {
  const chatId = state.selectedChatId;
  if (!chatId) return undefined;
  const ids = state.messageIdsByChatId[chatId] ?? [];
  return ids.length ? ids[ids.length - 1] : undefined;
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

export const selectIsTutorEnabled = (state: StoreState) => {
  const chat = selectCurrentChat(state);
  if (!chat) return false;
  return isTutorRuntimeEnabled(state.ui, chat, getClientTier());
};

export const selectModelCaps =
  (modelId?: string) =>
  (state: StoreState): ModelCapabilityFlags =>
    state.modelIndex.caps(modelId);

export const selectFavoriteModelIds = (state: StoreState) => state.favoriteModelIds;

export const selectHiddenModelIds = (state: StoreState) => state.hiddenModelIds;

export const selectRoutePreference = (state: StoreState) => state.ui.routePreference;

export const selectNotice = (state: StoreState) => state.ui.notice;

export const selectModels = (state: StoreState) => state.models;

export const selectNextOverrides = (state: StoreState) => readNextOverrides(state.ui);

export const selectNextModel = (state: StoreState) => selectNextOverrides(state).model;

export const selectActiveModelIds = (state: StoreState) => {
  const chat = selectCurrentChat(state);
  if (!chat) return [];
  const baseId = chat.settings.model;
  const parallel = normalizeParallelModels(baseId, chat.settings.parallel_models);
  return baseId ? [baseId, ...parallel] : parallel;
};

export const selectSearchEnabled = (state: StoreState) => {
  const chat = selectCurrentChat(state);
  if (chat) return !!chat.settings.search_enabled;
  return !!selectNextOverrides(state).search?.enabled;
};

export const selectSearchProvider = (state: StoreState) => {
  const chat = selectCurrentChat(state);
  const next = selectNextOverrides(state);
  const configured = chat?.settings.search_provider ?? next.search?.provider ?? 'openrouter';
  return state.ui.flags.experimentalBrave && configured === 'brave' ? 'brave' : 'openrouter';
};
