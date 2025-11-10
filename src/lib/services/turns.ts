// Module: services/turns
// Responsibility: Orchestrate chat turn lifecycle (send, regenerate, tutor persistence)
// while keeping the Zustand message slice focused on state updates.

import { v4 as uuidv4 } from 'uuid';
import type { Attachment, Message, LearnerModel, Chat } from '@/lib/types';
import {
  type StoreSetter,
  type StoreGetter,
  type StoreAccess,
  type TurnContext,
  type TurnComposition,
} from '@/lib/agent/types';
import { saveMessage, saveChat } from '@/lib/db';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { attachTutorUiState, ensureTutorDefaults, mergeTutorPayload } from '@/lib/agent/tutorFlow';
import { composeTurn } from '@/lib/agent/compose';
import { runDeepResearchTurn } from '@/lib/agent/deepResearchOrchestrator';
import { planTurn } from '@/lib/agent/planning';
import { streamFinal } from '@/lib/agent/streaming';
import { regenerate } from '@/lib/agent/regenerate';
import { snapshotGenSettings } from '@/lib/agent/generation';
import { shouldShortCircuitTutor } from '@/lib/agent/policy';
import { guardZdrOrNotifyCached } from '@/lib/zdr/cache';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import {
  NOTICE_INVALID_KEY,
  NOTICE_MISSING_CLIENT_KEY,
  NOTICE_MISSING_ANTHROPIC_KEY,
  NOTICE_RATE_LIMITED,
} from '@/lib/store/notices';
import { getLatestLearnerModel, initializeLearnerModel } from '@/lib/agent/learnerModel';
import { resetEphemeralUi } from '@/lib/ui/defaults';
import { normalizeParallelModels } from '@/lib/store/normalize';
import { updateMessageInChat } from '@/lib/store/messageUtils';
import { runTurn } from '@/lib/orchestrator/turn';
import { createModelAuthResolver, resolveSingleModelAuth } from '@/lib/services/auth';
import { prepareAttachmentsByModel } from '@/lib/services/attachments';
import type { UIState, UINextOverrides } from '@/lib/store/types';
import { applyNextOverrides, readNextOverrides } from '@/lib/ui/next';

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
    attachmentsByModel,
    priorMessages,
    modelAuthResolver,
  } = runtime;
  if (!activeModelIds.length || !primaryModelId) return;

  if (ui.zdrOnly === true) {
    for (const modelId of activeModelIds) {
      const allowed = await guardZdrOrNotifyCached(modelId, set, get);
      if (!allowed) return;
    }
  }

  if (tutorEnabled) primeTutorWelcome(chatId, { set, get });

  const spawned = await spawnTurnMessages({
    chatId,
    content,
    metadata,
    primaryAttachments: attachmentsByModel.get(primaryModelId) ?? [],
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

  const primaryAuth = modelAuthResolver.get(primaryModelId);
  if (!primaryAuth) {
    completeAll();
    return;
  }

  if (ui.experimentalDeepResearch && next.deepResearch) {
    if (primaryAuth.transport !== 'openrouter') {
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
      attachments: attachmentsByModel.get(modelId) ?? [],
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
      const updatedChat: Chat = { ...chat, settings: updatedSettings, updatedAt: Date.now() };
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
  if (get().ui.zdrOnly === true) {
    const allowed = await guardZdrOrNotifyCached(targetModel, set, get);
    if (!allowed) return;
  }

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

type SendRuntime = {
  chatId: string;
  chat: Chat;
  ui: UIState;
  next: UINextOverrides;
  tutorEnabled: boolean;
  activeModelIds: string[];
  primaryModelId?: string;
  attachmentsByModel: Map<string, Attachment[]>;
  priorMessages: Message[];
  baseTurnContext: Omit<TurnContext, 'apiKey' | 'transport'>;
  modelAuthResolver: ReturnType<typeof createModelAuthResolver>;
};

type SpawnMessagesResult = {
  userMessage: Message;
  assistantByModel: Map<string, Message>;
  masterController: AbortController;
  markComplete: () => void;
  completeAll: () => void;
};

const prepareSendRuntime = async ({
  attachments,
  set,
  get,
}: {
  attachments?: Attachment[];
  set: StoreSetter;
  get: StoreGetter;
}): Promise<SendRuntime | null> => {
  const chatId = get().selectedChatId;
  if (!chatId) return null;
  const initialChat = get().chats.find((c) => c.id === chatId);
  if (!initialChat) return null;
  let chat = initialChat;

  const ui = get().ui;
  const next = readNextOverrides(ui);
  const tutorGloballyEnabled = !!ui.experimentalTutor;
  const forceTutorMode = !!(ui.forceTutorMode ?? false);
  const tutorEnabled = tutorGloballyEnabled && (forceTutorMode || !!chat.settings.tutor_mode);

  let tutorDefaultModelId =
    ui.tutorDefaultModelId || chat.settings.tutor_default_model || DEFAULT_TUTOR_MODEL_ID;

  if (tutorEnabled) {
    const ensured = ensureTutorDefaults({
      ui,
      chat,
      fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    });
    if (ensured.changed) {
      const updatedChat: Chat = { ...chat, settings: ensured.nextSettings, updatedAt: Date.now() };
      set((state) => ({ chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
      chat = updatedChat;
      try {
        await saveChat(updatedChat);
      } catch {
        /* best effort */
      }
    }
    tutorDefaultModelId =
      ensured.defaultModelId ||
      chat.settings.tutor_default_model ||
      tutorDefaultModelId ||
      DEFAULT_TUTOR_MODEL_ID;
  }

  const parallelModels = normalizeParallelModels(
    chat.settings.model,
    chat.settings.parallel_models,
  );
  const activeModelIds = Array.from(
    new Set(
      [chat.settings.model, ...parallelModels].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  );
  if (!activeModelIds.length && chat.settings.model) activeModelIds.push(chat.settings.model);

  const modelAuthResolver = createModelAuthResolver({
    modelIndex: get().modelIndex,
    set,
  });
  const modelsNeedingAuth = new Set<string>(activeModelIds);
  if (tutorEnabled && tutorDefaultModelId) {
    modelsNeedingAuth.add(tutorDefaultModelId);
  }
  if (!modelAuthResolver.ensureAll(modelsNeedingAuth)) {
    return null;
  }

  const attachmentsByModel = await prepareAttachmentsByModel({
    attachments,
    modelIds: activeModelIds,
    models: get().models,
  });

  const baseTurnContext: Omit<TurnContext, 'apiKey' | 'transport'> = {
    set,
    get,
    models: get().models,
    modelIndex: get().modelIndex,
    persistMessage: saveMessage,
  };

  return {
    chatId,
    chat,
    ui,
    next,
    tutorEnabled,
    activeModelIds,
    primaryModelId: activeModelIds[0],
    attachmentsByModel,
    priorMessages: get().messages[chatId] ?? [],
    baseTurnContext,
    modelAuthResolver,
  };
};

const spawnTurnMessages = async ({
  chatId,
  content,
  metadata,
  primaryAttachments,
  activeModelIds,
  set,
  get,
}: {
  chatId: string;
  content: string;
  metadata?: Message['metadata'];
  primaryAttachments: Attachment[];
  activeModelIds: string[];
  set: StoreSetter;
  get: StoreGetter;
}): Promise<SpawnMessagesResult | null> => {
  if (!activeModelIds.length) return null;
  const now = Date.now();
  const userMessage: Message = {
    id: uuidv4(),
    chatId,
    role: 'user',
    content,
    createdAt: now,
    attachments: primaryAttachments.length ? primaryAttachments : undefined,
    metadata: metadata || undefined,
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
    toolCalls: [],
  })) as Message[];
  const assistantByModel = new Map<string, Message>();
  assistantPlaceholders.forEach((msg, index) => {
    const modelId = activeModelIds[index];
    assistantByModel.set(modelId, msg);
  });

  const masterController = new AbortController();
  setTurnController(chatId, masterController);
  let pendingStreams = assistantPlaceholders.length;
  if (pendingStreams === 0) {
    clearTurnController(chatId);
    return null;
  }

  const markComplete = () => {
    if (pendingStreams <= 0) return;
    pendingStreams -= 1;
    const stillRunning = pendingStreams > 0;
    set((state) => ({ ui: { ...state.ui, isStreaming: stillRunning } }));
    if (!stillRunning) clearTurnController(chatId);
  };

  const completeAll = () => {
    pendingStreams = 0;
    set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
    clearTurnController(chatId);
  };

  set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: [...(state.messages[chatId] ?? []), userMessage, ...assistantPlaceholders],
    },
    ui: { ...state.ui, isStreaming: true },
  }));

  await saveMessage(userMessage);
  for (const placeholder of assistantPlaceholders) {
    await saveMessage(placeholder);
  }

  return { userMessage, assistantByModel, masterController, markComplete, completeAll };
};

type ExecuteModelTurnArgs = {
  modelId: string;
  isPrimary: boolean;
  assistantMessage?: Message;
  attachments: Attachment[];
  runtime: SendRuntime;
  content: string;
  priorMessages: Message[];
  masterController: AbortController;
  markComplete: () => void;
  set: StoreSetter;
  get: StoreGetter;
  getCurrentChat: () => Chat;
  updateChat: (chat: Chat) => void;
};

const executeModelTurn = async ({
  modelId,
  isPrimary,
  assistantMessage,
  attachments,
  runtime,
  content,
  priorMessages,
  masterController,
  markComplete,
  set,
  get,
  getCurrentChat,
  updateChat,
}: ExecuteModelTurnArgs): Promise<void> => {
  if (!assistantMessage) {
    markComplete();
    return;
  }
  const controller = new AbortController();
  const abortListener = () => controller.abort();
  masterController.signal.addEventListener('abort', abortListener);

  let pendingLearnerModel: LearnerModel | undefined;
  let pendingPlanUpdates: Message['planUpdates'] | undefined;
  let priorLearnerModel: LearnerModel | undefined;
  let latestComposition: TurnComposition | undefined;

  const attachLearnerContextToAssistant = () => {
    if (!pendingLearnerModel && !pendingPlanUpdates) return;
    const patch: Partial<Message> = {};
    if (pendingLearnerModel) patch.learnerModel = pendingLearnerModel;
    if (pendingPlanUpdates) patch.planUpdates = pendingPlanUpdates;
    set((state) => updateMessageInChat(state, runtime.chatId, assistantMessage.id, patch));
  };

  try {
    const snapshot = get();
    const chat = getCurrentChat();
    const chatForModel: Chat = {
      ...chat,
      settings: {
        ...chat.settings,
        model: modelId,
      },
    };
    const auth = runtime.modelAuthResolver.get(modelId);
    if (!auth) {
      masterController.signal.removeEventListener('abort', abortListener);
      markComplete();
      return;
    }

    const baseTurnContext = {
      ...runtime.baseTurnContext,
      models: snapshot.models,
      modelIndex: snapshot.modelIndex,
    };

    const runResult = await runTurn({
      chat: chatForModel,
      chatId: runtime.chatId,
      modelId,
      userContent: content,
      assistantMessage,
      priorMessages,
      ui: snapshot.ui,
      controller,
      baseTurnContext,
      compose: composeTurn,
      plan: planTurn,
      streamFinal,
      authResolver: () => auth,
      attachmentPreparer: async () => attachments,
      fallbackAttachments: attachments,
      shouldShortCircuit: shouldShortCircuitTutor,
      hooks: {
        onComposition: (composition) => {
          latestComposition = composition;
          if (isPrimary && composition.consumedTutorNudge) {
            set((state) => ({ ui: resetEphemeralUi(state.ui) }));
          }
          if (composition.tutor.enabled && chat.settings.learningPlan) {
            priorLearnerModel =
              getLatestLearnerModel(priorMessages) ??
              initializeLearnerModel(runtime.chatId, chat.settings.learningPlan);
          }
        },
        onPlanResult: (plan) => {
          if (plan.learnerModel) pendingLearnerModel = plan.learnerModel;
          if (plan.planUpdates) pendingPlanUpdates = plan.planUpdates;
          if (
            plan.updatedPlan &&
            chat.settings.learningPlan &&
            plan.updatedPlan !== chat.settings.learningPlan
          ) {
            const updatedChat: Chat = {
              ...chat,
              settings: { ...chat.settings, learningPlan: plan.updatedPlan },
              updatedAt: Date.now(),
            };
            set((state) => ({
              chats: state.chats.map((c) => (c.id === runtime.chatId ? updatedChat : c)),
            }));
            updateChat(updatedChat);
            void saveChat(updatedChat).catch(() => {
              /* ignore */
            });
          }
          if (isPrimary && plan.learnerModel && plan.learnerModelDebug && priorLearnerModel) {
            set((state) => ({
              ui: {
                ...state.ui,
                learnerModelDebugByMessageId: {
                  ...(state.ui.learnerModelDebugByMessageId || {}),
                  [assistantMessage.id]: {
                    before: priorLearnerModel,
                    after: plan.learnerModel,
                    debug: plan.learnerModelDebug,
                    planUpdates: plan.planUpdates,
                  },
                },
              },
            }));
          }
          if (latestComposition) {
            try {
              const modelMeta = runtime.baseTurnContext.modelIndex.get(chatForModel.settings.model);
              const gen = snapshotGenSettings({
                settings: chatForModel.settings,
                modelMeta,
                searchProvider: latestComposition.search.provider,
                providerSort: latestComposition.providerSort,
              });
              set((state) =>
                updateMessageInChat(state, runtime.chatId, assistantMessage.id, {
                  systemSnapshot: plan.finalSystem,
                  genSettings: gen,
                }),
              );
            } catch {
              /* best effort */
            }
          }
        },
        beforeStream: () => {
          attachLearnerContextToAssistant();
        },
      },
    });

    if (runResult.shortCircuited) {
      const currentList = get().messages[runtime.chatId] ?? [];
      const current = currentList.find((m) => m.id === assistantMessage.id);
      const baseMessage: Message =
        (current as Message | undefined) ?? ({ ...assistantMessage } as Message);
      const finalMsg: Message = {
        ...baseMessage,
        content: current?.content ?? baseMessage.content ?? '',
        reasoning: current?.reasoning ?? baseMessage.reasoning,
        attachments: current?.attachments ?? baseMessage.attachments,
        tutor: (current as any)?.tutor ?? (baseMessage as any)?.tutor,
        hiddenContent:
          (current as any)?.hiddenContent ?? (baseMessage as any)?.hiddenContent ?? undefined,
        learnerModel: pendingLearnerModel ?? baseMessage.learnerModel,
        planUpdates: pendingPlanUpdates ?? baseMessage.planUpdates,
      };
      set((state) => updateMessageInChat(state, runtime.chatId, assistantMessage.id, finalMsg));
      await saveMessage(finalMsg);
      return;
    }
  } catch (error: any) {
    if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
      set((state) => ({ ui: { ...state.ui, notice: NOTICE_INVALID_KEY } }));
    } else if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
      set((state) => ({ ui: { ...state.ui, notice: NOTICE_RATE_LIMITED } }));
    }
    controller.abort();
  } finally {
    masterController.signal.removeEventListener('abort', abortListener);
    markComplete();
  }
};
