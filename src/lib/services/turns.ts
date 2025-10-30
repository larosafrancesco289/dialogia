// Module: services/turns
// Responsibility: Orchestrate chat turn lifecycle (send, regenerate, tutor persistence)
// while keeping the Zustand message slice focused on state updates.

import { v4 as uuidv4 } from 'uuid';
import type { Attachment, Message, ModelTransport } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import { type StoreSetter, type StoreGetter, type StoreAccess } from '@/lib/agent/types';
import { saveMessage, saveChat } from '@/lib/db';
import { prepareAttachmentsForModel } from '@/lib/agent/attachments';
import { requireClientKeyOrProxy, requireAnthropicClientKeyOrProxy } from '@/lib/config';
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
  NOTICE_MISSING_ANTHROPIC_KEY,
  NOTICE_RATE_LIMITED,
} from '@/lib/store/notices';
import { resolveModelTransport } from '@/lib/providers';

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

  // Variables for learner model and plan updates
  let pendingLearnerModel: any;
  let pendingPlanUpdates: any;

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

  const modelIndexSnapshot = get().modelIndex;
  const authByTransport = new Map<ModelTransport, { key?: string; useProxy: boolean }>();
  const authByModelId = new Map<string, { transport: ModelTransport; apiKey: string }>();

  const ensureAuthForTransport = (transport: ModelTransport) => {
    if (authByTransport.has(transport)) return authByTransport.get(transport)!;
    try {
      const status =
        transport === 'anthropic' ? requireAnthropicClientKeyOrProxy() : requireClientKeyOrProxy();
      authByTransport.set(transport, status);
      return status;
    } catch (error) {
      const notice =
        transport === 'anthropic' ? NOTICE_MISSING_ANTHROPIC_KEY : NOTICE_MISSING_CLIENT_KEY;
      set((state) => ({ ui: { ...state.ui, notice } }));
      throw error;
    }
  };

  const ensureAuthForModel = (modelId?: string) => {
    if (!modelId) return null;
    if (authByModelId.has(modelId)) return authByModelId.get(modelId)!;
    const meta = modelIndexSnapshot.get(modelId);
    const transport = resolveModelTransport(modelId, meta);
    const transportAuth = ensureAuthForTransport(transport);
    const entry = { transport, apiKey: transportAuth.key || '' };
    authByModelId.set(modelId, entry);
    return entry;
  };

  try {
    const modelsNeedingAuth = new Set<string>();
    activeModelIds.forEach((id) => {
      if (id) modelsNeedingAuth.add(id);
    });
    if (tutorEnabled) {
      if (tutorDefaultModelId) modelsNeedingAuth.add(tutorDefaultModelId);
      if (tutorMemoryModelId) modelsNeedingAuth.add(tutorMemoryModelId);
    }
    for (const id of modelsNeedingAuth) {
      ensureAuthForModel(id);
    }
  } catch {
    return;
  }

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

  // Auto-generate learning plan if goal detected and no plan exists
  if (tutorEnabled && !chat.settings.learningPlan && priorMessages.length === 0) {
    try {
      const { detectLearningGoal, generateLearningPlan } = await import(
        '@/lib/agent/planGenerator'
      );
      const { updateNodeStatus } = await import('@/lib/agent/planGenerator');
      const { initializeLearnerModel } = await import('@/lib/agent/learnerModel');

      const goalDetection = detectLearningGoal(content);

      if (goalDetection.detected && goalDetection.confidence > 0.6 && goalDetection.goal) {
        const planAuth = ensureAuthForModel(tutorDefaultModelId);
        if (planAuth) {
          const plan = await generateLearningPlan(goalDetection.goal, {
            apiKey: planAuth.apiKey,
            transport: planAuth.transport,
            model: tutorDefaultModelId,
          });

          // Mark first node as in_progress
          const startedPlan =
            plan.nodes.length > 0 ? updateNodeStatus(plan, plan.nodes[0].id, 'in_progress') : plan;

          // Store plan in chat settings
          const updatedChat = {
            ...chat,
            settings: {
              ...chat.settings,
              learningPlan: startedPlan,
              planGenerated: true,
              planGenerationModel: tutorDefaultModelId,
              enableLearnerModel: true, // Auto-enable learner tracking
            },
            updatedAt: Date.now(),
          };

          set((state) => ({ chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)) }));
          chat = updatedChat;

          try {
            await saveChat(updatedChat);
          } catch {
            /* ignore */
          }

          // Initialize learner model
          pendingLearnerModel = initializeLearnerModel(chatId, startedPlan);
        }
      }
    } catch (error) {
      console.error('Goal detection / plan generation failed:', error);
      // Continue with normal tutoring
    }
  }

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

  const primaryAuth = primaryModelId ? authByModelId.get(primaryModelId) : undefined;
  if (get().ui.experimentalDeepResearch && get().ui.nextDeepResearch) {
    if (!primaryAuth || primaryAuth.transport !== 'openrouter') {
      set((state) => ({
        ui: {
          ...state.ui,
          nextDeepResearch: false,
          notice:
            state.ui.notice ??
            'DeepResearch currently requires an OpenRouter model selection.',
        },
      }));
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
        while (pendingStreams > 0) markComplete();
        return;
      }
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
    const memoryAuth = ensureAuthForModel(tutorMemoryModelId);
    if (memoryAuth) {
      const result = await maybeAdvanceTutorMemory({
        apiKey: memoryAuth.apiKey,
        transport: memoryAuth.transport,
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
        tutorGlobalMemory: chat?.settings.tutor_memory || state.ui.tutorGlobalMemory,
        tutorMemoryDebugByMessageId: {
          ...(state.ui.tutorMemoryDebugByMessageId || {}),
          [primaryAssistant.id]: snapshot,
        },
      },
    }));
  }

  // Update learner model if plan exists
  if (tutorEnabled && chat.settings.learningPlan) {
    const modelAuth = ensureAuthForModel(tutorMemoryModelId); // Reuse same model as memory
    if (modelAuth) {
      try {
        const { getLatestLearnerModel, initializeLearnerModel, maybeUpdateLearnerModel } =
          await import('@/lib/agent/learnerModel');
        const { processPlanProgress } = await import('@/lib/agent/planAwareTutor');

        // Get or initialize learner model
        let currentModel = getLatestLearnerModel(priorMessages);
        if (!currentModel) {
          currentModel = initializeLearnerModel(chatId, chat.settings.learningPlan);
        }

        // Update learner model based on conversation
        const modelResult = await maybeUpdateLearnerModel({
          apiKey: modelAuth.apiKey,
          transport: modelAuth.transport,
          modelId: tutorMemoryModelId,
          plan: chat.settings.learningPlan,
          learnerModel: currentModel,
          conversation: priorMessages.concat(userMsg),
          updateFrequency: chat.settings.learnerModelUpdateFrequency || 3,
          autoUpdate: chat.settings.enableLearnerModel !== false,
        });

        pendingLearnerModel = modelResult.updatedModel;

        // Check if plan needs status updates
        const planResult = await processPlanProgress(
          chat.settings.learningPlan,
          modelResult.updatedModel,
        );

        // Update plan in chat settings if changed
        if (planResult.updatedPlan !== chat.settings.learningPlan) {
          const updatedChat = {
            ...chat,
            settings: {
              ...chat.settings,
              learningPlan: planResult.updatedPlan,
            },
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

        pendingPlanUpdates = planResult.planUpdates;

        // Store debug info in UI
        if (modelResult.debug) {
          set((state) => ({
            ui: {
              ...state.ui,
              learnerModelDebugByMessageId: {
                ...(state.ui.learnerModelDebugByMessageId || {}),
                [primaryAssistant.id]: {
                  before: currentModel,
                  after: modelResult.updatedModel,
                  debug: modelResult.debug,
                  planUpdates: pendingPlanUpdates,
                },
              },
            },
          }));
        }
      } catch (error) {
        console.error('Learner model update failed:', error);
        // Continue with normal tutoring
      }
    }
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
    const auth = authByModelId.get(modelId) || ensureAuthForModel(modelId);
    if (!auth) {
      masterController.signal.removeEventListener('abort', abortListener);
      onComplete();
      return;
    }
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
    const attachLearnerContextToAssistant = () => {
      if (!pendingLearnerModel && !pendingPlanUpdates) return;
      const patch: Partial<Message> = {};
      if (pendingLearnerModel) {
        patch.learnerModel = pendingLearnerModel;
      }
      if (pendingPlanUpdates) {
        patch.planUpdates = pendingPlanUpdates;
      }
      Object.assign(assistantMessage, patch);
      set((state) => {
        const list = state.messages[chatId] ?? [];
        const updated = list.map((m) =>
          m.id === assistantMessage.id ? ({ ...m, ...patch } as Message) : m,
        );
        return { messages: { ...state.messages, [chatId]: updated } };
      });
    };

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
          apiKey: auth.apiKey,
          transport: auth.transport,
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
            learnerModel: pendingLearnerModel,
            planUpdates: pendingPlanUpdates,
          } as Message;
          set((state) => {
            const list = state.messages[chatId] ?? [];
            const updated = list.map((m) => (m.id === assistantMessage.id ? finalMsg : m));
            return { messages: { ...state.messages, [chatId]: updated } };
          });
          await saveMessage(finalMsg);
          return;
        }

        attachLearnerContextToAssistant();

        const streamingMessages = (
          [{ role: 'system', content: planResult.finalSystem } as const] as any[]
        ).concat(composedMessages.filter((m) => m.role !== 'system'));

        await streamFinal({
          chat: chatForModel,
          chatId,
          assistantMessage,
          messages: streamingMessages,
          controller,
          apiKey: auth.apiKey,
          transport: auth.transport,
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

      attachLearnerContextToAssistant();

      await streamFinal({
        chat: chatForModel,
        chatId,
        assistantMessage,
        messages: composedMessages,
        controller,
        apiKey: auth.apiKey,
        transport: auth.transport,
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
  const modelIndexSnapshot = get().modelIndex;
  const targetAuth = resolveModelAuthForSingle({
    modelId: targetModel,
    modelIndex: modelIndexSnapshot,
    set,
  });
  if (!targetAuth) return;
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
      apiKey: targetAuth.apiKey,
      transport: targetAuth.transport,
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

function resolveModelAuthForSingle({
  modelId,
  modelIndex,
  set,
}: {
  modelId?: string;
  modelIndex: ModelIndex;
  set: StoreSetter;
}): { transport: ModelTransport; apiKey: string } | null {
  if (!modelId) return null;
  const meta = modelIndex.get(modelId);
  const transport = resolveModelTransport(modelId, meta);
  try {
    const status =
      transport === 'anthropic' ? requireAnthropicClientKeyOrProxy() : requireClientKeyOrProxy();
    return { transport, apiKey: status.key || '' };
  } catch {
    const notice =
      transport === 'anthropic' ? NOTICE_MISSING_ANTHROPIC_KEY : NOTICE_MISSING_CLIENT_KEY;
    set((state) => ({ ui: { ...state.ui, notice } }));
    return null;
  }
}
