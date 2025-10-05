// Module: services/turns
// Responsibility: Orchestrate chat turn lifecycle (send, regenerate, tutor persistence)
// while keeping the Zustand message slice focused on state updates.

import { v4 as uuidv4 } from 'uuid';
import type { Attachment, Message } from '@/lib/types';
import { type StoreSetter, type StoreGetter, type StoreAccess } from '@/lib/agent/types';
import { saveMessage, saveChat } from '@/lib/db';
import { prepareAttachmentsForModel } from '@/lib/agent/attachments';
import { getPublicOpenRouterKey, isOpenRouterProxyEnabled } from '@/lib/config';
import {
  DEFAULT_TUTOR_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_MODEL_ID,
} from '@/lib/constants';
import {
  attachTutorUiState,
  ensureTutorDefaults,
  maybeAdvanceTutorMemory,
  mergeTutorPayload,
} from '@/lib/agent/tutorFlow';
import { composeTurn } from '@/lib/agent/compose';
import { runDeepResearchTurn } from '@/lib/agent/deepResearchOrchestrator';
import { planTurn, regenerate, streamFinal } from '@/lib/services/messagePipeline';
import { snapshotGenSettings } from '@/lib/agent/generation';
import { shouldShortCircuitTutor } from '@/lib/agent/policy';
import { guardZdrOrNotify } from '@/lib/zdr/cache';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import { isApiError } from '@/lib/api/errors';

export type SendTurnOptions = {
  content: string;
  attachments?: Attachment[];
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
  const uiTutor = state.ui.tutorByMessageId?.[messageId];
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

export async function sendUserTurn({ content, attachments, set, get }: SendTurnOptions) {
  const useProxy = isOpenRouterProxyEnabled();
  const key = getPublicOpenRouterKey();
  if (!key && !useProxy) {
    set((state) => ({ ui: { ...state.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY' } }));
    return;
  }

  const chatId = get().selectedChatId;
  if (!chatId) return;
  let chat = get().chats.find((c) => c.id === chatId);
  if (!chat) return;

  const uiState = get().ui;
  const tutorGloballyEnabled = !!uiState.experimentalTutor;
  const forceTutorMode = !!(uiState.forceTutorMode ?? false);
  const tutorEnabled = tutorGloballyEnabled && (forceTutorMode || !!chat.settings.tutor_mode);

  let tutorDefaultModelId = uiState.tutorDefaultModelId || chat.settings.tutor_default_model;
  let tutorMemoryModelId =
    uiState.tutorMemoryModelId ||
    chat.settings.tutor_memory_model ||
    tutorDefaultModelId ||
    DEFAULT_TUTOR_MEMORY_MODEL_ID;
  if (!tutorDefaultModelId) tutorDefaultModelId = DEFAULT_TUTOR_MODEL_ID;
  if (!tutorMemoryModelId) tutorMemoryModelId = DEFAULT_TUTOR_MEMORY_MODEL_ID;

  const memoryAutoUpdateEnabled =
    uiState.tutorMemoryAutoUpdate !== false && chat.settings.tutor_memory_disabled !== true;

  if (tutorEnabled) {
    const ensured = ensureTutorDefaults({
      ui: uiState,
      chat,
      fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
      fallbackMemoryModelId: DEFAULT_TUTOR_MEMORY_MODEL_ID,
    });
    if (ensured.changed) {
      const updatedChat = { ...chat, settings: ensured.nextSettings, updatedAt: Date.now() };
      set((state) => ({ chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
      chat = updatedChat;
      try {
        await saveChat(updatedChat);
      } catch {
        /* persist best effort */
      }
    }
    tutorDefaultModelId = chat.settings.tutor_default_model || tutorDefaultModelId;
    tutorMemoryModelId = chat.settings.tutor_memory_model || tutorMemoryModelId;
  }

  const activeModelId = chat.settings.model;

  const preparedAttachments = await prepareAttachmentsForModel({
    attachments,
    modelId: activeModelId,
    models: get().models,
  });

  if (tutorEnabled) primeTutorWelcome(chatId, { set, get });

  const priorMessages = get().messages[chatId] ?? [];

  if (get().ui.zdrOnly === true) {
    const allowed = await guardZdrOrNotify(activeModelId, set, get);
    if (!allowed) return;
  }

  const now = Date.now();
  const userMsg: Message = {
    id: uuidv4(),
    chatId,
    role: 'user',
    content,
    createdAt: now,
    attachments: preparedAttachments.length ? preparedAttachments : undefined,
  };

  const assistantMsg: Message = {
    id: uuidv4(),
    chatId,
    role: 'assistant',
    content: '',
    createdAt: now + 1,
    model: activeModelId,
    reasoning: '',
    attachments: [],
  };

  set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: [...(state.messages[chatId] ?? []), userMsg, assistantMsg],
    },
    ui: { ...state.ui, isStreaming: true },
  }));

  await saveMessage(userMsg);
  await saveMessage(assistantMsg);

  if (get().ui.experimentalDeepResearch && get().ui.nextDeepResearch) {
    const handled = await runDeepResearchTurn({
      task: content,
      modelId: activeModelId,
      chatId,
      assistantMessage: assistantMsg,
      set,
      get,
      persistMessage: saveMessage,
    });
    if (handled) return;
  }

  let memoryDebug:
    | {
        before?: string;
        after?: string;
        version?: number;
        messageCount?: number;
        conversationWindow?: string;
        raw?: string;
      }
    | undefined;

  if (tutorEnabled) {
    const result = await maybeAdvanceTutorMemory({
      apiKey: key || '',
      modelId: tutorMemoryModelId,
      settings: chat.settings,
      conversation: priorMessages.concat(userMsg),
      autoUpdate: memoryAutoUpdateEnabled,
    });

    const updatedChat = { ...chat, settings: result.nextSettings, updatedAt: Date.now() };
    if (JSON.stringify(updatedChat.settings) !== JSON.stringify(chat.settings)) {
      set((state) => ({ chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
      chat = updatedChat;
      try {
        await saveChat(updatedChat);
      } catch {
        /* ignore */
      }
    }
    memoryDebug = result.debug;
  }

  if (tutorEnabled) {
    const snapshot = {
      version: chat.settings.tutor_memory_version,
      messageCount: chat.settings.tutor_memory_message_count,
      after: chat.settings.tutor_memory,
      before: memoryDebug?.before,
      raw: memoryDebug?.raw,
      conversationWindow: memoryDebug?.conversationWindow,
      updatedAt: memoryDebug ? Date.now() : undefined,
      model: tutorMemoryModelId,
    };
    set((state) => ({
      ui: {
        ...state.ui,
        tutorGlobalMemory: chat.settings.tutor_memory || state.ui.tutorGlobalMemory,
        tutorMemoryDebugByMessageId: {
          ...(state.ui.tutorMemoryDebugByMessageId || {}),
          [assistantMsg.id]: snapshot,
        },
      },
    }));
  }

  if (chat.title === 'New Chat') {
    const draft = content.trim().slice(0, 40);
    await get().renameChat(chat.id, draft || 'New Chat');
  }

  const stateSnapshot = get();
  const composition = await composeTurn({
    chat,
    ui: stateSnapshot.ui,
    modelIndex: stateSnapshot.modelIndex,
    prior: priorMessages,
    newUser: { content, attachments: preparedAttachments },
    attachments: preparedAttachments,
  });

  if (composition.consumedTutorNudge) {
    set((state) => ({ ui: { ...state.ui, nextTutorNudge: undefined } }));
  }

  const composedMessages = composition.messages;
  const combinedSystemForThisTurn = composition.system;
  const providerSort = composition.providerSort;
  const shouldPlan = composition.shouldPlan;
  const searchEnabled = composition.search.enabled;
  const searchProvider = composition.search.provider;
  const toolDefinition = composition.tools ?? [];
  const plugins = composition.plugins;

  try {
    if (shouldPlan) {
      const controller = new AbortController();
      setTurnController(chatId, controller);
      const planResult = await planTurn({
        chat,
        chatId,
        assistantMessage: assistantMsg,
        userContent: content,
        combinedSystem: combinedSystemForThisTurn,
        baseMessages: composedMessages,
        toolDefinition,
        searchEnabled,
        searchProvider,
        providerSort,
        apiKey: key || '',
        controller,
        set,
        get,
        models: get().models,
        modelIndex: get().modelIndex,
        persistMessage: saveMessage,
      });

      try {
        const modelMeta = get().modelIndex.get(chat.settings.model);
        const gen = snapshotGenSettings({
          settings: chat.settings,
          modelMeta,
          searchProvider,
          providerSort,
        });
        set((state) => {
          const list = state.messages[chatId] ?? [];
          const updated = list.map((m) =>
            m.id === assistantMsg.id
              ? ({ ...m, systemSnapshot: planResult.finalSystem, genSettings: gen } as any)
              : m,
          );
          return { messages: { ...state.messages, [chatId]: updated } };
        });
      } catch {
        /* best effort snapshot */
      }

      if (shouldShortCircuitTutor(planResult)) {
        set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
        const current = get().messages[chatId]?.find((m) => m.id === assistantMsg.id);
        const finalMsg = {
          ...assistantMsg,
          content: current?.content || '',
          reasoning: current?.reasoning,
          attachments: current?.attachments,
          tutor: (current as any)?.tutor,
          hiddenContent: (current as any)?.hiddenContent,
        } as Message;
        set((state) => {
          const list = state.messages[chatId] ?? [];
          const updated = list.map((m) => (m.id === assistantMsg.id ? finalMsg : m));
          return { messages: { ...state.messages, [chatId]: updated } };
        });
        await saveMessage(finalMsg);
        clearTurnController(chatId);
        return;
      }

      const streamingMessages = (
        [{ role: 'system', content: planResult.finalSystem } as const] as any[]
      ).concat(composedMessages.filter((m) => m.role !== 'system'));

      await streamFinal({
        chat,
        chatId,
        assistantMessage: assistantMsg,
        messages: streamingMessages,
        controller,
        apiKey: key || '',
        providerSort,
        set,
        get,
        models: get().models,
        modelIndex: get().modelIndex,
        persistMessage: saveMessage,
        plugins,
        toolDefinition,
        startBuffered: false,
      });
      return;
    }

    const controller = new AbortController();
    setTurnController(chatId, controller);
    await streamFinal({
      chat,
      chatId,
      assistantMessage: assistantMsg,
      messages: composedMessages,
      controller,
      apiKey: key || '',
      providerSort,
      set,
      get,
      models: get().models,
      modelIndex: get().modelIndex,
      persistMessage: saveMessage,
      plugins,
      startBuffered: shouldPlan,
    });
  } catch (error: any) {
    if (isApiError(error) && error.code === 'unauthorized') {
      set((state) => ({ ui: { ...state.ui, isStreaming: false, notice: 'Invalid API key' } }));
    } else if (isApiError(error) && error.code === 'rate_limited') {
      set((state) => ({
        ui: { ...state.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
      }));
    }
    clearTurnController(chatId);
  }
}

export type RegenerateTurnArgs = {
  messageId: string;
  overrideModelId?: string;
  set: StoreSetter;
  get: StoreGetter;
};

export async function regenerateTurn({ messageId, overrideModelId, set, get }: RegenerateTurnArgs) {
  const useProxy = isOpenRouterProxyEnabled();
  const key = getPublicOpenRouterKey();
  if (!key && !useProxy) {
    set((state) => ({ ui: { ...state.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY' } }));
    return;
  }

  const chatId = get().selectedChatId;
  if (!chatId) return;
  let chat = get().chats.find((c) => c.id === chatId);
  if (!chat) return;

  const uiState = get().ui;
  const tutorGloballyEnabled = !!uiState.experimentalTutor;
  const forceTutorMode = !!(uiState.forceTutorMode ?? false);
  const tutorEnabled = tutorGloballyEnabled && (forceTutorMode || !!chat.settings.tutor_mode);

  if (tutorEnabled) {
    const desiredModel =
      uiState.tutorDefaultModelId ||
      chat.settings.tutor_default_model ||
      DEFAULT_TUTOR_MODEL_ID;
    overrideModelId = desiredModel;
    if (chat.settings.model !== desiredModel || chat.settings.tutor_default_model !== desiredModel) {
      const updatedSettings = {
        ...chat.settings,
        model: desiredModel,
        tutor_default_model: desiredModel,
      };
      const updatedChat = { ...chat, settings: updatedSettings, updatedAt: Date.now() };
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
  if (get().ui.zdrOnly === true) {
    const allowed = await guardZdrOrNotify(targetModel, set, get);
    if (!allowed) return;
  }

  const messages = get().messages[chatId] ?? [];
  if (!messages.some((m) => m.id === messageId)) return;

  try {
    const controller = new AbortController();
    setTurnController(chatId, controller);
    await regenerate({
      chat,
      chatId,
      targetMessageId: messageId,
      messages,
      models: get().models,
      modelIndex: get().modelIndex,
      apiKey: key || '',
      controller,
      set,
      get,
      persistMessage: saveMessage,
      overrideModelId,
    });
  } catch (error: any) {
    if (isApiError(error) && error.code === 'unauthorized') {
      set((state) => ({ ui: { ...state.ui, isStreaming: false, notice: 'Invalid API key' } }));
    } else if (isApiError(error) && error.code === 'rate_limited') {
      set((state) => ({
        ui: { ...state.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
      }));
    }
    clearTurnController(chatId);
  }
}

export type AttachTutorUiArgs = {
  messageId: string;
  patch: Record<string, unknown>;
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
