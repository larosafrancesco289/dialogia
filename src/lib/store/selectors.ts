// Module: store/selectors
// Responsibility: Shared read-only selectors for Zustand store consumers.

import type { Chat } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import type { ModelCapabilityFlags } from '@/lib/models';
import { readNextOverrides } from '@/lib/ui/next';
import { normalizeParallelModels } from '@/lib/store/normalize';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { getClientTier } from '@/lib/auth/tier.client';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { resolveTurnSettings } from '@/lib/settings/resolve';

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

const resolveTutorEnabled = (state: StoreState, chat?: Chat) => {
  const tier = getClientTier();
  if (chat) return isTutorRuntimeEnabled(state.ui, chat, tier);
  if (tier === 'study') return true;
  const overrides = readNextOverrides(state.ui);
  return (
    !!state.ui.flags.experimentalTutor && (!!state.ui.tutor.forceMode || !!overrides.tutorMode)
  );
};

export const selectIsTutorEnabled = (state: StoreState) =>
  resolveTutorEnabled(state, selectCurrentChat(state));

export const selectIsTutorEnabledForChat = (chatId?: string) => (state: StoreState) =>
  resolveTutorEnabled(state, chatId ? state.chats.find((chat) => chat.id === chatId) : undefined);

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

export const selectNextModel = (state: StoreState) => selectNextOverrides(state).modelId;

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
  return resolveTurnSettings({
    chat,
    ui: state.ui,
    modelIndex: state.modelIndex,
    tier: getClientTier(),
  });
};

export const selectActiveModelIds = (state: StoreState) => {
  const chat = selectCurrentChat(state);
  if (!chat) return [];
  const baseId = chat.settings.modelId;
  const parallel = normalizeParallelModels(baseId, chat.settings.parallelModels);
  return baseId ? [baseId, ...parallel] : parallel;
};

export const selectSearchEnabled = (state: StoreState) => {
  const resolved = selectResolvedTurnSettings(state);
  if (resolved) return resolved.searchEnabled;
  return !!selectNextOverrides(state).search?.enabled;
};

export const selectSearchProvider = (state: StoreState) => {
  const resolved = selectResolvedTurnSettings(state);
  if (resolved) return resolved.searchProvider;
  const next = selectNextOverrides(state);
  const configured = next.search?.provider ?? 'openrouter';
  return state.ui.flags.experimentalBrave && configured === 'brave' ? 'brave' : 'openrouter';
};
