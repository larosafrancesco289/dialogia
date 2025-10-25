// Module: store/selectors
// Responsibility: Shared read-only selectors for Zustand store consumers.

import type { StoreState } from '@/lib/store/types';
import type { ModelCapabilityFlags } from '@/lib/models';

export const selectCurrentChat = (state: StoreState) => {
  const chatId = state.selectedChatId;
  if (!chatId) return undefined;
  return state.chats.find((chat) => chat.id === chatId);
};

export const selectMessagesForChat =
  (chatId?: string) =>
  (state: StoreState) =>
    chatId ? state.messages[chatId] ?? [] : [];

export const selectMessagesForCurrentChat = (state: StoreState) => {
  const chatId = state.selectedChatId;
  return chatId ? state.messages[chatId] ?? [] : [];
};

export const selectIsStreaming = (state: StoreState) => state.ui.isStreaming;

export const selectIsTutorEnabled = (state: StoreState) => {
  const chat = selectCurrentChat(state);
  const tutorGloballyEnabled = !!state.ui.experimentalTutor;
  if (!tutorGloballyEnabled) return false;
  if (state.ui.forceTutorMode) return true;
  return !!chat?.settings.tutor_mode;
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

export const selectNextModel = (state: StoreState) => state.ui.nextModel;
