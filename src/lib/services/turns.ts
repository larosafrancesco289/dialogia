// Module: services/turns
// Responsibility: Orchestrate chat turn lifecycle (send, regenerate, tutor persistence)
// while keeping the Zustand message slice focused on state updates.

import type { DraftAttachment, Chat, Message, MessageTutor } from '@/lib/types';
import type { StoreAccess, StoreGetter, StoreSetter, TurnContext } from '@/lib/agent/types';
import type { Repository } from '@/lib/db/repository';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { attachTutorUiState, ensureTutorDefaults } from '@/lib/agent/tutorFlow';
import { runDeepResearchTurn } from '@/lib/agent/deepResearchOrchestrator';
import { regenerate } from '@/lib/agent/regenerate';
import { guardZdrOrNotifyCached } from '@/lib/policy/zdr/cache';
import { clearTurnController, setTurnController } from '@/lib/services/controllers';
import { applyNextOverrides } from '@/lib/ui/next';
import { prepareSendRuntime } from '@/lib/services/turns/runtime';
import { spawnTurnMessages } from '@/lib/services/turns/spawn';
import { executeModelTurn } from '@/lib/services/turns/executor';
import { handleTurnApiError } from '@/lib/services/turns/errors';
import { resolveSingleModelAuth } from '@/lib/services/auth';
import { evaluateDeepResearchPolicy } from '@/lib/services/deepResearchPolicy';
import { enforceZdrGate, isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { selectTutorEntry } from '@/lib/ui/tutorSelectors';
import { findModelById } from '@/lib/models';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import {
  createMessagePersister,
  ensureHiddenTutorContent,
} from '@/lib/services/messagePersistence';
import { scheduleTutorPersistence } from '@/lib/services/tutorPersistence';
import { resetEphemeralUi } from '@/lib/ui/defaults';
import { triggerAsyncTitleGeneration } from '@/lib/services/titleGenerator';

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
    model: modelId || chat.settings.model,
  });
  set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: [...(state.messages[chatId] ?? []), assistantMsg],
    },
  }));
  const persistMessage = createMessagePersister(repository);
  await persistMessage(assistantMsg);
}

export type PersistTutorArgs = {
  messageId: string;
  store: StoreAccess;
  repository: Repository;
};

export async function persistTutorForMessage({ messageId, store, repository }: PersistTutorArgs) {
  const { get, set } = store;
  const state = get();
  const uiTutor = selectTutorEntry(state.ui, messageId);
  if (!uiTutor) return;
  let updatedMsg: Message | undefined;
  for (const [cid, list] of Object.entries(state.messages)) {
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx === -1) continue;
    const target = list[idx];
    const prevTutor = target.tutor;
    const merged: MessageTutor = { ...(prevTutor || {}), ...(uiTutor || {}) };
    const nextMessage = ensureHiddenTutorContent({
      ...target,
      tutor: merged,
    }) as Message;
    set((draft) => ({
      messages: {
        ...draft.messages,
        [cid]: list.map((m) => (m.id === messageId ? nextMessage : m)),
      },
    }));
    updatedMsg = nextMessage;
    break;
  }
  if (updatedMsg) {
    scheduleTutorPersistence({ message: updatedMsg, repository });
  }
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

  // Auto-activate DeepResearch if:
  // 1. Search is enabled in chat settings
  // 2. Primary model supports reasoning
  // 3. We are not in tutor mode (simplification, tutor has its own tools)
  // 4. Transport is OpenRouter (DeepResearch requirement)
  const modelMeta = findModelById(get().models, primaryModelId);
  const deepResearchDecision = evaluateDeepResearchPolicy({
    searchEnabled: !!currentChat.settings.search_enabled,
    tutorEnabled,
    transport: primaryContext.auth.transport,
    modelMeta,
  });

  if (deepResearchDecision.notice) {
    set((state) => ({
      ui: applyNextOverrides(state.ui, { deepResearch: false }),
    }));
    if (!get().ui.notice) {
      const setNotice = get().setNotice;
      if (typeof setNotice === 'function') {
        setNotice(deepResearchDecision.notice);
      } else {
        set((state) => ({
          ui: {
            ...state.ui,
            notice: deepResearchDecision.notice,
          },
        }));
      }
    }
  } else if (deepResearchDecision.shouldRun) {
    const handled = await runDeepResearchTurn({
      task: content,
      modelId: primaryModelId,
      chatId,
      assistantMessage: primaryAssistant,
      set,
      get,
      persistMessage: createMessagePersister(repository),
      controller: masterController,
    });
    if (handled) {
      completeAll();
      return;
    }
  }

  if (currentChat.title === 'New Chat') {
    triggerAsyncTitleGeneration(
      currentChat.id,
      content,
      get().renameChat.bind(get()),
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
    const ensured = ensureTutorDefaults({
      ui: uiState,
      chat,
      fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    });
    overrideModelId =
      ensured.defaultModelId ||
      uiState.tutor.defaultModelId ||
      chat.settings.tutor_default_model ||
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

  const targetModel = overrideModelId || chat.settings.model;
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

  const messages = get().messages[chatId] ?? [];
  if (!messages.some((m) => m.id === messageId)) return;

  const controller = new AbortController();
  try {
    setTurnController(chatId, controller);
    const turnContext = {
      apiKey: targetAuth.apiKey,
      transport: targetAuth.transport,
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
    handleTurnApiError(error, set, get);
    clearTurnController(chatId, controller);
  }
}

export type AttachTutorUiArgs = {
  messageId: string;
  patch: Partial<MessageTutor>;
  store: StoreAccess;
};

export function attachTutorState({ messageId, patch, store }: AttachTutorUiArgs) {
  const { set, get } = store;
  const snapshot = get();
  const { ui, messages, selectedChatId } = snapshot;
  if (!selectedChatId) return undefined;
  const { nextUi, nextMessages, updatedMessage } = attachTutorUiState({
    currentUi: ui.tutor.byMessageId,
    currentMessages: messages[selectedChatId] ?? [],
    messageId,
    patch,
  });
  set((state) => ({
    messages: {
      ...state.messages,
      [selectedChatId]: nextMessages,
    },
    ui: {
      ...state.ui,
      tutor: {
        ...state.ui.tutor,
        byMessageId: nextUi,
      },
    },
  }));
  return updatedMessage;
}
