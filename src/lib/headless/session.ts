import 'server-only';
import type { StoreApi } from 'zustand/vanilla';
import { createHeadlessStore, type HeadlessStoreOptions } from '@/lib/headless/store';
import type { StoreState, UIState } from '@/lib/store/types';
import type { Chat, Message, ModelTransport, ModelDescriptor } from '@/lib/types';
import { type PlanTurnResult, type PersistMessage, type TurnContext } from '@/lib/agent/types';
import { composeTurn } from '@/lib/agent/compose';
import { planTurn } from '@/lib/agent/planning';
import { streamFinal } from '@/lib/agent/streaming';
import { DEFAULT_BASE_SYSTEM, shouldShortCircuitTutor } from '@/lib/agent/policy';
import { resolveModelTransport } from '@/lib/providers';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import type { ModelIndex } from '@/lib/models';
import { runTurn } from '@/lib/agent/orchestrator/turn';
import { createTurnLifecycle } from '@/lib/agent/orchestrator/lifecycle';
import { finalizeShortCircuitMessage } from '@/lib/services/turns/shortCircuit';
import type { HeadlessTurnArtifacts, HeadlessTurnResult } from '@/lib/headless/types';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { resolveTurnSettings } from '@/lib/settings/resolve';

export type ApiKeyResolver = (params: { modelId: string; transport: ModelTransport }) => string;

export type HeadlessTutorSessionOptions = {
  chat: Chat;
  models?: ModelDescriptor[];
  modelIndex?: ModelIndex;
  uiOverrides?: Partial<UIState>;
  initialMessages?: Message[];
  resolveApiKey: ApiKeyResolver;
  store?: StoreApi<StoreState>;
};

export class HeadlessTutorSession {
  private readonly store: StoreApi<StoreState>;
  private readonly resolveApiKey: ApiKeyResolver;
  private readonly chatId: string;

  constructor(private readonly options: HeadlessTutorSessionOptions) {
    this.resolveApiKey = options.resolveApiKey;
    if (options.store) {
      this.store = options.store;
    } else {
      const storeOptions: HeadlessStoreOptions = {
        chat: options.chat,
        models: options.models,
        modelIndex: options.modelIndex,
        messages: options.initialMessages,
        uiOverrides: options.uiOverrides,
      };
      this.store = createHeadlessStore(storeOptions);
    }
    this.chatId = options.chat.id;
  }

  getState(): StoreState {
    return this.store.getState();
  }

  getMessages(): Message[] {
    return this.store.getState().messages[this.chatId] ?? [];
  }

  private persistMessage: PersistMessage = async (message) => {
    this.store.setState((state) => {
      const list = state.messages[message.chatId] ?? [];
      const nextList = list.map((entry) => (entry.id === message.id ? { ...message } : entry));
      return {
        messages: {
          ...state.messages,
          [message.chatId]: nextList,
        },
      };
    });
  };

  private updateMessage(messageId: string, patch: Partial<Message>): Message | undefined {
    let updated: Message | undefined;
    this.store.setState((state) => {
      const list = state.messages[this.chatId] ?? [];
      const nextList = list.map((msg) => {
        if (msg.id !== messageId) return msg;
        updated = { ...msg, ...patch } as Message;
        return updated;
      });
      return {
        messages: {
          ...state.messages,
          [this.chatId]: nextList,
        },
      };
    });
    return updated;
  }

  async runTurn(content: string): Promise<HeadlessTurnResult> {
    const state = this.store.getState();
    let chat = state.chats.find((c) => c.id === this.chatId);
    if (!chat) throw new Error('Headless tutor chat not found');

    const now = Date.now();
    const userMessage = createUserMessage({
      chatId: this.chatId,
      content,
      createdAt: now,
    });
    const assistantMessage = createAssistantMessage({
      chatId: this.chatId,
      content: '',
      createdAt: now + 1,
      model: chat.settings.model,
    });

    const priorMessages = this.store.getState().messages[this.chatId] ?? [];
    this.store.setState((draft) => {
      const list = draft.messages[this.chatId] ?? [];
      return {
        messages: {
          ...draft.messages,
          [this.chatId]: [...list, userMessage, assistantMessage],
        },
        ui: { ...draft.ui, isStreaming: true },
      };
    });

    const controller = new AbortController();
    setTurnController(this.chatId, controller);

    const baseTurnContext: Omit<TurnContext, 'apiKey' | 'transport'> = {
      set: this.store.setState.bind(this.store),
      get: this.store.getState.bind(this.store),
      models: this.store.getState().models,
      modelIndex: this.store.getState().modelIndex,
      persistMessage: this.persistMessage,
    };

    let finalAssistant: Message | undefined;
    let runArtifacts: Awaited<ReturnType<typeof runTurn>> | undefined;

    const authResolver = (modelId: string) => {
      const modelMeta = baseTurnContext.modelIndex.get(modelId);
      const transport = resolveModelTransport(modelId, modelMeta);
      const apiKey = this.resolveApiKey({ modelId, transport });
      if (!apiKey) throw new Error(`Missing API key for ${transport} transport`);
      return { transport, apiKey };
    };

    const lifecycle = createTurnLifecycle({
      chatId: this.chatId,
      assistantMessageId: assistantMessage.id,
      isPrimary: true,
      priorMessages,
      getChatForTurn: () => {
        const found = this.store.getState().chats.find((c) => c.id === this.chatId);
        const fallback = this.store.getState().chats[0];
        return found ?? chat ?? fallback!;
      },
      set: this.store.setState.bind(this.store),
      get: this.store.getState.bind(this.store),
      updateChat: (nextChat) => {
        chat = nextChat;
      },
      updateMessage: (patch) => {
        this.updateMessage(assistantMessage.id, patch);
      },
    });

    try {
      const settings = resolveTurnSettings({
        chat,
        ui: this.store.getState().ui,
        modelIndex: baseTurnContext.modelIndex,
        modelId: chat.settings.model,
      });

      runArtifacts = await runTurn({
        chat,
        chatId: this.chatId,
        modelId: chat.settings.model,
        userContent: content,
        assistantMessage,
        priorMessages,
        ui: this.store.getState().ui,
        settings,
        controller,
        baseTurnContext,
        compose: composeTurn,
        plan: planTurn,
        streamFinal,
        authResolver,
        attachmentPreparer: async () => [],
        shouldShortCircuit: shouldShortCircuitTutor,
        hooks: lifecycle.hooks,
      });

      if (runArtifacts.shortCircuited) {
        const finalMsg = await finalizeShortCircuitMessage({
          chatId: this.chatId,
          assistantMessage,
          lifecycle,
          getState: () => this.store.getState(),
          updateMessage: (messageId, patch) => {
            this.updateMessage(messageId, patch);
          },
          persistMessage: this.persistMessage,
        });
        const planArtifacts: PlanTurnResult = lifecycle.latestPlan() ??
          runArtifacts.plan ?? {
            finalSystem:
              runArtifacts.composition.system ?? chat.settings.system ?? DEFAULT_BASE_SYSTEM,
            usedTutorContentTool: false,
            hasSearchResults: false,
          };
        return this.finishTurn(userMessage, finalMsg, {
          composition: {
            system: runArtifacts.composition.system,
            tools: runArtifacts.composition.tools,
            plugins: runArtifacts.composition.plugins,
            settings: runArtifacts.composition.settings,
            shouldPlan: runArtifacts.composition.shouldPlan,
          },
          plan: planArtifacts,
          tutorUi: this.store.getState().ui.tutor.byMessageId?.[assistantMessage.id],
          toolCalls: finalMsg.toolCalls,
          debugPayload: this.store.getState().ui.debug.byMessageId?.[assistantMessage.id]?.body,
        });
      }

      const messageList = this.store.getState().messages[this.chatId] ?? [];
      finalAssistant = messageList.find((msg) => msg.id === assistantMessage.id);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error';
      const fallback = this.updateMessage(assistantMessage.id, {
        content: `Tutor execution error: ${text}`,
      });
      finalAssistant = fallback ?? assistantMessage;
    } finally {
      clearTurnController(this.chatId, controller);
      this.store.setState((draft) => ({
        ui: { ...draft.ui, isStreaming: false },
      }));
    }

    const finalMessages = this.store.getState().messages[this.chatId] ?? [];
    const assistantFinal =
      finalAssistant ?? finalMessages.find((msg) => msg.id === assistantMessage.id);
    if (!assistantFinal) throw new Error('Assistant message missing after streaming');
    const planArtifacts: PlanTurnResult = lifecycle.latestPlan() ??
      runArtifacts?.plan ?? {
        finalSystem:
          runArtifacts?.composition.system ?? chat.settings.system ?? DEFAULT_BASE_SYSTEM,
        usedTutorContentTool: false,
        hasSearchResults: false,
      };

    return this.finishTurn(userMessage, assistantFinal, {
      composition: {
        system: runArtifacts?.composition.system,
        tools: runArtifacts?.composition.tools,
        plugins: runArtifacts?.composition.plugins,
        settings: runArtifacts?.composition.settings,
        shouldPlan: runArtifacts?.composition.shouldPlan ?? false,
      },
      plan: planArtifacts,
      tutorUi: this.store.getState().ui.tutor.byMessageId?.[assistantMessage.id],
      toolCalls: assistantFinal.toolCalls,
      debugPayload: this.store.getState().ui.debug.byMessageId?.[assistantMessage.id]?.body,
    });
  }

  private finishTurn(
    user: Message,
    assistant: Message,
    artifacts: HeadlessTurnArtifacts,
  ): HeadlessTurnResult {
    return {
      user,
      assistant,
      artifacts,
    };
  }
}
