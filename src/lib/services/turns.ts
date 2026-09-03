// Module: services/turns
// Responsibility: Orchestrate chat turn lifecycle (send, regenerate, tutor persistence)
// while keeping the Zustand message slice focused on state updates.

import type { DraftAttachment, Chat, Message } from '@/lib/types';
import type { StoreAccess, StoreGetter, StoreSetter, TurnContext } from '@/lib/agent/types';
import type { Repository } from '@/lib/db/repository';
import { applyModuleSettingsDefaults } from '@/lib/settings/moduleDefaults';
import { regenerate } from '@/lib/agent/regenerate';
import { guardZdrOrNotifyCached } from '@/lib/policy/zdr/cache';
import { clearTurnController, setTurnController } from '@/lib/turns/runtime';
import { prepareSendRuntime } from '@/lib/turns/runtime';
import { spawnTurnMessages } from '@/lib/services/turns/spawn';
import { executeModelTurn } from '@/lib/services/turns/executor';
import { handleTurnApiError } from '@/lib/services/turns/errors';
import { resolveSingleModelAuth } from '@/lib/services/auth';
import { enforceZdrGate, isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { resetEphemeralUi } from '@/lib/ui/defaults';
import { triggerAsyncTitleGeneration } from '@/lib/services/titleGenerator';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';

export type SendTurnOptions = {
  content: string;
  attachments?: DraftAttachment[];
  metadata?: Message['metadata'];
  set: StoreSetter;
  get: StoreGetter;
  repository: Repository;
};

export function primeTutorWelcome(chatId: string | undefined, store: StoreAccess) {
  if (!chatId) return;
  try {
    const maybe = store.get().prepareTutorWelcomeMessage?.(chatId);
    if (maybe && typeof maybe.then === 'function') {
      maybe.catch(() => undefined);
    }
  } catch {
    // ignore tutor welcome prefetch failures
  }
}

export type AppendAssistantArgs = {
  content: string;
  modelId?: string;
  set: StoreSetter;
  get: StoreGetter;
  repository: Repository;
};

export async function appendAssistantTurn({
  content,
  modelId,
  set,
  get,
  repository,
}: AppendAssistantArgs) {
  const chatId = get().selectedChatId;
  if (!chatId) return;
  const chat = get().chats.find((c) => c.id === chatId);
  if (!chat) return;
  const now = Date.now();
  const assistantMsg = createAssistantMessage({
    chatId,
    content,
    createdAt: now,
    model: modelId || chat.settings.modelId,
  });
  set((state) => appendMessagesToChat(state, chatId, [assistantMsg]));
  const persistMessage = createMessagePersister(repository);
  await persistMessage(assistantMsg);
}

export async function sendUserTurn({
  content,
  attachments,
  metadata,
  set,
  get,
  repository,
}: SendTurnOptions) {
  const runtime = await prepareSendRuntime({ attachments, set, get, repository });
  if (!runtime) return;
  let currentChat = runtime.chat;
  const { chatId, ui, tutorEnabled, activeModelIds, primaryModelId, priorMessages, modelContexts } =
    runtime;
  if (!activeModelIds.length || !primaryModelId) return;

  const zdrAllowed = await enforceZdrGate(ui, modelContexts.keys(), (modelId) =>
    guardZdrOrNotifyCached(modelId, set, get),
  );
  if (!zdrAllowed) return;

  if (ui.overrides) {
    set((state) => ({ ui: resetEphemeralUi(state.ui) }));
  }

  if (tutorEnabled) primeTutorWelcome(chatId, { set, get });

  const spawned = await spawnTurnMessages({
    chatId,
    content,
    metadata,
    primaryAttachments: modelContexts.get(primaryModelId)?.attachments ?? [],
    activeModelIds,
    set,
    get,
    repository,
  });
  if (!spawned) return;

  const { assistantByModel, masterController, markComplete, completeAll } = spawned;
  const primaryAssistant = assistantByModel.get(primaryModelId);
  if (!primaryAssistant) {
    completeAll();
    return;
  }

  const primaryContext = modelContexts.get(primaryModelId);
  if (!primaryContext) {
    completeAll();
    return;
  }

  if (currentChat.title === 'New Chat') {
    triggerAsyncTitleGeneration(
      currentChat.id,
      content,
      get().renameChat.bind(get()),
      primaryContext.auth.endpoint,
      get().ui.zdrOnly === true,
      primaryModelId,
    );
  }

  const runPerModel = (modelId: string) =>
    executeModelTurn({
      modelId,
      isPrimary: modelId === primaryModelId,
      assistantMessage: assistantByModel.get(modelId),
      attachments: modelContexts.get(modelId)?.attachments ?? [],
      runtime,
      content,
      priorMessages,
      masterController,
      markComplete,
      set,
      get,
      getCurrentChat: () => currentChat,
      updateChat: (nextChat) => {
        currentChat = nextChat;
      },
      repository,
    });

  await Promise.allSettled(activeModelIds.map(runPerModel));
}

export type RegenerateTurnArgs = {
  messageId: string;
  overrideModelId?: string;
  set: StoreSetter;
  get: StoreGetter;
  repository: Repository;
};

export async function regenerateTurn({
  messageId,
  overrideModelId,
  set,
  get,
  repository,
}: RegenerateTurnArgs) {
  const chatId = get().selectedChatId;
  if (!chatId) return;
  const initialChat = get().chats.find((c) => c.id === chatId);
  if (!initialChat) return;
  let chat: Chat = initialChat;

  const uiState = get().ui;
  const tutorEnabled = isTutorRuntimeEnabled(uiState, chat);

  if (tutorEnabled) {
    const ensured = applyModuleSettingsDefaults({ chat, ui: uiState });
    overrideModelId =
      ensured.preferredModelId ||
      uiState.tutor?.defaultModelId ||
      chat.settings.features.tutor?.defaultModelId ||
      overrideModelId;
    if (ensured.changed) {
      const updatedChat: Chat = {
        ...chat,
        settings: ensured.nextSettings,
        updatedAt: Date.now(),
      };
      set((state) => ({ chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
      chat = updatedChat;
      try {
        await repository.saveChat(updatedChat);
      } catch {
        /* ignore */
      }
    }
  }

  const targetModel = overrideModelId || chat.settings.modelId;
  const modelIndexSnapshot = get().modelIndex;
  const targetAuth = resolveSingleModelAuth({
    modelId: targetModel,
    modelIndex: modelIndexSnapshot,
    set,
    get,
  });
  if (!targetAuth) return;
  const canUseModel = await enforceZdrGate(get().ui, [targetModel], (modelId) =>
    guardZdrOrNotifyCached(modelId, set, get),
  );
  if (!canUseModel) return;

  const messages = getMessagesForChat(get(), chatId);
  if (!messages.some((m) => m.id === messageId)) return;

  const controller = new AbortController();
  try {
    setTurnController(chatId, controller);
    const turnContext = {
      auth: targetAuth,
      set,
      get,
      models: get().models,
      modelIndex: modelIndexSnapshot,
      persistMessage: createMessagePersister(repository),
    } satisfies TurnContext;
    await regenerate({
      chat,
      chatId,
      targetMessageId: messageId,
      messages,
      turn: turnContext,
      controller,
      overrideModelId,
    });
  } catch (error: unknown) {
    handleTurnApiError(error, set, get, chatId);
    clearTurnController(chatId, controller);
  }
}
