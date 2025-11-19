// Module: services/turns
// Responsibility: Orchestrate chat turn lifecycle (send, regenerate, tutor persistence)
// while keeping the Zustand message slice focused on state updates.

import { v4 as uuidv4 } from 'uuid';
import type { Attachment, Chat, Message, MessageTutor } from '@/lib/types';
import type { StoreAccess, StoreGetter, StoreSetter, TurnContext } from '@/lib/agent/types';
import { saveChat, saveMessage } from '@/lib/db';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { attachTutorUiState, ensureTutorDefaults, mergeTutorPayload } from '@/lib/agent/tutorFlow';
import { runDeepResearchTurn } from '@/lib/agent/deepResearchOrchestrator';
import { regenerate } from '@/lib/agent/regenerate';
import { guardZdrOrNotifyCached } from '@/lib/zdr/cache';
import { clearTurnController, setTurnController } from '@/lib/services/controllers';
import { applyNextOverrides } from '@/lib/ui/next';
import { prepareSendRuntime } from '@/lib/services/turns/runtime';
import { spawnTurnMessages } from '@/lib/services/turns/spawn';
import { executeModelTurn } from '@/lib/services/turns/executor';
import { handleTurnApiError } from '@/lib/services/turns/errors';
import { resolveSingleModelAuth } from '@/lib/services/auth';
import { enforceZdrGate } from '@/lib/policy/runtime';
import { selectTutorEntry } from '@/lib/ui/tutorSelectors';

export type SendTurnOptions = {
  content: string;
  attachments?: Attachment[];
  metadata?: Message['metadata'];
  set: StoreSetter;
  get: StoreGetter;
};

export function primeTutorWelcome(chatId: string | undefined, store: StoreAccess) {
  if (!chatId) return;
  try {
    const maybe = (store.get().prepareTutorWelcomeMessage as any)?.(chatId);
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
};

export async function appendAssistantTurn({ content, modelId, set, get }: AppendAssistantArgs) {
  const chatId = get().selectedChatId;
  if (!chatId) return;
  const chat = get().chats.find((c) => c.id === chatId);
  if (!chat) return;
  const now = Date.now();
  const assistantMsg: Message = {
    id: uuidv4(),
    chatId,
    role: 'assistant',
    content,
    createdAt: now,
    model: modelId || chat.settings.model,
    reasoning: '',
    toolCalls: [],
  };
  set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: [...(state.messages[chatId] ?? []), assistantMsg],
    },
  }));
  await saveMessage(assistantMsg);
}

export type PersistTutorArgs = {
  messageId: string;
  store: StoreAccess;
};

export async function persistTutorForMessage({ messageId, store }: PersistTutorArgs) {
  const { get, set } = store;
  const state = get();
  const uiTutor = selectTutorEntry(state.ui, messageId);
  if (!uiTutor) return;
  let updatedMsg: Message | undefined;
  for (const [cid, list] of Object.entries(state.messages)) {
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx === -1) continue;
    const target = list[idx];
    const prevTutor = (target as any)?.tutor;
    const { merged, hiddenContent } = mergeTutorPayload(prevTutor, uiTutor);
    const nextMessage = { ...target, tutor: merged, hiddenContent } as Message;
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
    try {
      await saveMessage(updatedMsg);
    } catch {
      /* noop */
    }
  }
}

export async function sendUserTurn({
  content,
  attachments,
  metadata,
  set,
  get,
}: SendTurnOptions) {
  const runtime = await prepareSendRuntime({ attachments, set, get });
  if (!runtime) return;
  let currentChat = runtime.chat;
  const {
    chatId,
    ui,
    next,
    tutorEnabled,
    activeModelIds,
    primaryModelId,
    priorMessages,
    modelContexts,
  } = runtime;
  if (!activeModelIds.length || !primaryModelId) return;

  const zdrAllowed = await enforceZdrGate(ui, modelContexts.keys(), (modelId) =>
    guardZdrOrNotifyCached(modelId, set, get),
  );
  if (!zdrAllowed) return;

  if (tutorEnabled) primeTutorWelcome(chatId, { set, get });

  const spawned = await spawnTurnMessages({
    chatId,
    content,
    metadata,
    primaryAttachments: modelContexts.get(primaryModelId)?.attachments ?? [],
    activeModelIds,
    set,
    get,
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

  if (ui.experimentalDeepResearch && next.deepResearch) {
    if (primaryContext.auth.transport !== 'openrouter') {
      set((state) => {
        const updated = applyNextOverrides(state.ui, { deepResearch: false });
        return {
          ui: {
            ...updated,
            notice:
              state.ui.notice ??
              'DeepResearch currently requires an OpenRouter model selection.',
          },
        };
      });
    } else {
      const handled = await runDeepResearchTurn({
        task: content,
        modelId: primaryModelId,
        chatId,
        assistantMessage: primaryAssistant,
        set,
        get,
        persistMessage: saveMessage,
      });
      if (handled) {
        completeAll();
        return;
      }
    }
  }

  if (currentChat.title === 'New Chat') {
    const draft = content.trim().slice(0, 40);
    await get().renameChat(currentChat.id, draft || 'New Chat');
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
    });

  await Promise.allSettled(activeModelIds.map(runPerModel));
}

export type RegenerateTurnArgs = {
  messageId: string;
  overrideModelId?: string;
  set: StoreSetter;
  get: StoreGetter;
};

export async function regenerateTurn({ messageId, overrideModelId, set, get }: RegenerateTurnArgs) {
  const chatId = get().selectedChatId;
  if (!chatId) return;
  const initialChat = get().chats.find((c) => c.id === chatId);
  if (!initialChat) return;
  let chat: Chat = initialChat;

  const uiState = get().ui;
  const tutorGloballyEnabled = !!uiState.experimentalTutor;
  const forceTutorMode = !!(uiState.forceTutorMode ?? false);
  const tutorEnabled = tutorGloballyEnabled && (forceTutorMode || !!chat.settings.tutor_mode);

  if (tutorEnabled) {
    const ensured = ensureTutorDefaults({
      ui: uiState,
      chat,
      fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    });
    overrideModelId =
      ensured.defaultModelId ||
      uiState.tutorDefaultModelId ||
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
        await saveChat(updatedChat);
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
  });
  if (!targetAuth) return;
  const canUseModel = await enforceZdrGate(get().ui, [targetModel], (modelId) =>
    guardZdrOrNotifyCached(modelId, set, get),
  );
  if (!canUseModel) return;

  const messages = get().messages[chatId] ?? [];
  if (!messages.some((m) => m.id === messageId)) return;

  try {
    const controller = new AbortController();
    setTurnController(chatId, controller);
    const turnContext = {
      apiKey: targetAuth.apiKey,
      transport: targetAuth.transport,
      set,
      get,
      models: get().models,
      modelIndex: modelIndexSnapshot,
      persistMessage: saveMessage,
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
  } catch (error: any) {
    handleTurnApiError(error, set);
    clearTurnController(chatId);
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
    currentUi: ui.tutorByMessageId,
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
      tutorByMessageId: nextUi,
    },
  }));
  return updatedMessage;
}
