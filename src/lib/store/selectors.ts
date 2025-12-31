// Module: store/selectors
// Responsibility: Shared read-only selectors for Zustand store consumers.

import type { StoreState } from '@/lib/store/types';
import type { ModelCapabilityFlags } from '@/lib/models';
import { readNextOverrides } from '@/lib/ui/next';
import { normalizeParallelModels } from '@/lib/store/normalize';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { getCookie } from '@/lib/auth/cookies.client';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import type { AccessTier } from '@/lib/auth/types';

export const selectCurrentChat = (state: StoreState) => {
  const chatId = state.selectedChatId;
  if (!chatId) return undefined;
  return state.chats.find((chat) => chat.id === chatId);
};

export const selectSelectedChatId = (state: StoreState) => state.selectedChatId;

export const selectMessagesForChat = (chatId?: string) => (state: StoreState) =>
  chatId ? (state.messages[chatId] ?? []) : [];

export const selectMessagesForCurrentChat = (state: StoreState) => {
  const chatId = state.selectedChatId;
  return chatId ? (state.messages[chatId] ?? []) : [];
};

export const selectLastMessageId = (state: StoreState) => {
  const chatId = state.selectedChatId;
  if (!chatId) return undefined;
  const list = state.messages[chatId] ?? [];
  return list.length ? list[list.length - 1]?.id : undefined;
};

export const selectIsStreaming = (state: StoreState) => state.ui.isStreaming;

export const selectIsTutorEnabled = (state: StoreState) => {
  const chat = selectCurrentChat(state);
  if (!chat) return false;
  const tierCookie = getCookie(TIER_COOKIE_NAME);
  const tier: AccessTier =
    tierCookie === 'developer' || tierCookie === 'individual' || tierCookie === 'study'
      ? tierCookie
      : 'free';
  return isTutorRuntimeEnabled(state.ui, chat, tier);
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
