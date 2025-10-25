// Module: services/turns
// Responsibility: Orchestrate chat turn lifecycle (send, regenerate, tutor persistence)
// while keeping the Zustand message slice focused on state updates.

import { v4 as uuidv4 } from 'uuid';
import type { Attachment, Message } from '@/lib/types';
import { type StoreSetter, type StoreGetter, type StoreAccess } from '@/lib/agent/types';
import { saveMessage, saveChat } from '@/lib/db';
import { prepareAttachmentsForModel } from '@/lib/agent/attachments';
import { requireClientKeyOrProxy } from '@/lib/config';
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
import { planTurn } from '@/lib/agent/planning';
import { streamFinal } from '@/lib/agent/streaming';
import { regenerate } from '@/lib/agent/regenerate';
import { snapshotGenSettings } from '@/lib/agent/generation';
import { shouldShortCircuitTutor } from '@/lib/agent/policy';
import { guardZdrOrNotify } from '@/lib/zdr/cache';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import {
  NOTICE_INVALID_KEY,
  NOTICE_MISSING_CLIENT_KEY,
  NOTICE_RATE_LIMITED,
} from '@/lib/store/notices';

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
  let key: string | undefined;
  try {
    const status = requireClientKeyOrProxy();
    key = status.key;
  } catch {
    set((state) => ({ ui: { ...state.ui, notice: NOTICE_MISSING_CLIENT_KEY } }));
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
  let tutorMemoryModelId = (
    uiState.tutorMemoryModelId ||
    chat.settings.tutor_memory_model ||
    tutorDefaultModelId ||
    DEFAULT_TUTOR_MEMORY_MODEL_ID
  );
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

  const parallelModels = Array.isArray(chat.settings.parallel_models)
    ? chat.settings.parallel_models.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const activeModelIds = Array.from(
    new Set(
      [chat.settings.model, ...parallelModels].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  );
  if (!activeModelIds.length && chat.settings.model) activeModelIds.push(chat.settings.model);
  const primaryModelId = activeModelIds[0];

  const modelsList = get().models;
  const attachmentsByModel = new Map<string, Attachment[]>();
  await Promise.all(
    activeModelIds.map(async (modelId) => {
      const prepared = await prepareAttachmentsForModel({
        attachments,
        modelId,
        models: modelsList,
      });
      attachmentsByModel.set(modelId, prepared);
    }),
  );
  const primaryAttachments = attachmentsByModel.get(primaryModelId) ?? [];

  if (tutorEnabled) primeTutorWelcome(chatId, { set, get });

  const priorMessages = get().messages[chatId] ?? [];

  if (get().ui.zdrOnly === true) {
    for (const modelId of activeModelIds) {
      const allowed = await guardZdrOrNotify(modelId, set, get);
      if (!allowed) return;
    }
  }

  const now = Date.now();
  const userMsg: Message = {
    id: uuidv4(),
    chatId,
    role: 'user',
    content,
    createdAt: now,
    attachments: primaryAttachments.length ? primaryAttachments : undefined,
  };

  const assistantPlaceholders = activeModelIds.map((modelId, index) => ({
    id: uuidv4(),
    chatId,
    role: 'assistant',
    content: '',
    createdAt: now + 1 + index,
    model: modelId,
    reasoning: '',
    attachments: [],
  })) as Message[];
  const assistantByModel = new Map<string, Message>();
  assistantPlaceholders.forEach((msg, index) => {
    const modelId = activeModelIds[index];
    assistantByModel.set(modelId, msg);
  });
  const primaryAssistant = assistantByModel.get(primaryModelId);
  if (!primaryAssistant) return;

  const masterController = new AbortController();
  setTurnController(chatId, masterController);
  let pendingStreams = assistantPlaceholders.length;
  if (pendingStreams === 0) {
    clearTurnController(chatId);
    set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
    return;
  }

  const markComplete = () => {
    if (pendingStreams <= 0) return;
    pendingStreams -= 1;
    const stillRunning = pendingStreams > 0;
    set((state) => ({ ui: { ...state.ui, isStreaming: stillRunning } }));
    if (!stillRunning) clearTurnController(chatId);
  };

  set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: [...(state.messages[chatId] ?? []), userMsg, ...assistantPlaceholders],
    },
    ui: { ...state.ui, isStreaming: true },
  }));

  await saveMessage(userMsg);
  for (const placeholder of assistantPlaceholders) {
    await saveMessage(placeholder);
  }

  if (get().ui.experimentalDeepResearch && get().ui.nextDeepResearch) {
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
      while (pendingStreams > 0) markComplete();
      return;
    }
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
          [primaryAssistant.id]: snapshot,
        },
      },
    }));
  }

  if (chat.title === 'New Chat') {
    const draft = content.trim().slice(0, 40);
    await get().renameChat(chat.id, draft || 'New Chat');
  }

  const runModelTurn = async ({
    modelId,
    assistantMessage,
    attachmentsForModel,
    isPrimary,
    masterController,
    onComplete,
  }: {
    modelId: string;
    assistantMessage: Message;
    attachmentsForModel: Attachment[];
    isPrimary: boolean;
    masterController: AbortController;
    onComplete: () => void;
  }): Promise<void> => {
    const snapshot = get();
    const chatForModel = {
      ...chat,
      settings: {
        ...chat.settings,
        model: modelId,
      },
    };
    const controller = new AbortController();
    const abortListener = () => controller.abort();
    masterController.signal.addEventListener('abort', abortListener);
    const composition = await composeTurn({
      chat: chatForModel,
      ui: snapshot.ui,
      modelIndex: snapshot.modelIndex,
      prior: priorMessages,
      newUser: { content, attachments: attachmentsForModel },
      attachments: attachmentsForModel,
    });

    if (isPrimary && composition.consumedTutorNudge) {
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
        const planResult = await planTurn({
          chat: chatForModel,
          chatId,
          assistantMessage,
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
          models: snapshot.models,
          modelIndex: snapshot.modelIndex,
          persistMessage: saveMessage,
        });

        try {
          const modelMeta = get().modelIndex.get(chatForModel.settings.model);
          const gen = snapshotGenSettings({
            settings: chatForModel.settings,
            modelMeta,
            searchProvider,
            providerSort,
          });
          set((state) => {
            const list = state.messages[chatId] ?? [];
            const updated = list.map((m) =>
              m.id === assistantMessage.id
                ? ({ ...m, systemSnapshot: planResult.finalSystem, genSettings: gen } as any)
                : m,
            );
            return { messages: { ...state.messages, [chatId]: updated } };
          });
        } catch {
          /* best effort snapshot */
        }

        if (shouldShortCircuitTutor(planResult)) {
          const current = get().messages[chatId]?.find((m) => m.id === assistantMessage.id);
          const finalMsg = {
            ...assistantMessage,
            content: current?.content || '',
            reasoning: current?.reasoning,
            attachments: current?.attachments,
            tutor: (current as any)?.tutor,
            hiddenContent: (current as any)?.hiddenContent,
          } as Message;
          set((state) => {
            const list = state.messages[chatId] ?? [];
            const updated = list.map((m) => (m.id === assistantMessage.id ? finalMsg : m));
            return { messages: { ...state.messages, [chatId]: updated } };
          });
          await saveMessage(finalMsg);
          return;
        }

        const streamingMessages = (
          [{ role: 'system', content: planResult.finalSystem } as const] as any[]
        ).concat(composedMessages.filter((m) => m.role !== 'system'));

        await streamFinal({
          chat: chatForModel,
          chatId,
          assistantMessage,
          messages: streamingMessages,
          controller,
          apiKey: key || '',
          providerSort,
          set,
          get,
          models: snapshot.models,
          modelIndex: snapshot.modelIndex,
          persistMessage: saveMessage,
          plugins,
          toolDefinition,
          startBuffered: false,
        });
        return;
      }

      await streamFinal({
        chat: chatForModel,
        chatId,
        assistantMessage,
        messages: composedMessages,
        controller,
        apiKey: key || '',
        providerSort,
        set,
        get,
        models: snapshot.models,
        modelIndex: snapshot.modelIndex,
        persistMessage: saveMessage,
        plugins,
        toolDefinition,
        startBuffered: false,
      });
    } catch (error: any) {
      if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
        set((state) => ({ ui: { ...state.ui, notice: NOTICE_INVALID_KEY } }));
      } else if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
        set((state) => ({
          ui: { ...state.ui, notice: NOTICE_RATE_LIMITED },
        }));
      }
      controller.abort();
    } finally {
      masterController.signal.removeEventListener('abort', abortListener);
      onComplete();
    }
  };
  const runPromises = activeModelIds.map((modelId) => {
    const assistantMessage = assistantByModel.get(modelId);
    if (!assistantMessage) {
      markComplete();
      return Promise.resolve();
    }
    const attachmentsForModel = attachmentsByModel.get(modelId) ?? [];
    return runModelTurn({
      modelId,
      assistantMessage,
      attachmentsForModel,
      isPrimary: modelId === primaryModelId,
      masterController,
      onComplete: markComplete,
    });
  });

  await Promise.allSettled(runPromises);
}

export type RegenerateTurnArgs = {
  messageId: string;
  overrideModelId?: string;
  set: StoreSetter;
  get: StoreGetter;
};

export async function regenerateTurn({ messageId, overrideModelId, set, get }: RegenerateTurnArgs) {
  let key: string | undefined;
  try {
    const status = requireClientKeyOrProxy();
    key = status.key;
  } catch {
    set((state) => ({ ui: { ...state.ui, notice: NOTICE_MISSING_CLIENT_KEY } }));
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
    if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
      set((state) => ({ ui: { ...state.ui, isStreaming: false, notice: NOTICE_INVALID_KEY } }));
    } else if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
      set((state) => ({
        ui: { ...state.ui, isStreaming: false, notice: NOTICE_RATE_LIMITED },
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
