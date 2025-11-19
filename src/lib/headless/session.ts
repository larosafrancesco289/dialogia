import { v4 as uuidv4 } from 'uuid';
import type { StoreApi } from 'zustand/vanilla';
import { createHeadlessStore, type HeadlessStoreOptions } from '@/lib/headless/store';
import type { StoreState, UIState } from '@/lib/store/types';
import type { Chat, Message, ModelTransport, ORModel, ToolCallLogEntry } from '@/lib/types';
import {
  type PlanTurnResult,
  type PersistMessage,
  type TurnComposition,
  type TurnContext,
} from '@/lib/agent/types';
import { composeTurn } from '@/lib/agent/compose';
import { planTurn } from '@/lib/agent/planning';
import { streamFinal } from '@/lib/agent/streaming';
import { DEFAULT_BASE_SYSTEM, shouldShortCircuitTutor } from '@/lib/agent/policy';
import { resolveModelTransport } from '@/lib/providers';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import type { ModelIndex } from '@/lib/models';
import { runTurn } from '@/lib/orchestrator/turn';
import { createTurnLifecycle } from '@/lib/orchestrator/lifecycle';

export type ApiKeyResolver = (params: { modelId: string; transport: ModelTransport }) => string;

export type HeadlessTutorSessionOptions = {
  chat: Chat;
  models?: ORModel[];
  modelIndex?: ModelIndex;
  uiOverrides?: Partial<UIState>;
  initialMessages?: Message[];
  resolveApiKey: ApiKeyResolver;
  store?: StoreApi<StoreState>;
};

export type HeadlessTurnArtifacts = {
  composition: {
    system?: string;
    tools?: TurnComposition['tools'];
    plugins?: TurnComposition['plugins'];
    providerSort?: TurnComposition['providerSort'];
    shouldPlan: boolean;
  };
  plan: PlanTurnResult;
  tutorUi?: Record<string, unknown>;
  toolCalls?: ToolCallLogEntry[];
  debugPayload?: string;
};

export type HeadlessTurnResult = {
  user: Message;
  assistant: Message;
  artifacts: HeadlessTurnArtifacts;
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
    const userMessage: Message = {
      id: uuidv4(),
      chatId: this.chatId,
      role: 'user',
      content,
      createdAt: now,
    };
    const assistantMessage: Message = {
      id: uuidv4(),
      chatId: this.chatId,
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      model: chat.settings.model,
      reasoning: '',
      toolCalls: [],
    };

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
      getChatForTurn: () =>
        this.store.getState().chats.find((c) => c.id === this.chatId) ?? chat,
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
      runArtifacts = await runTurn({
        chat,
        chatId: this.chatId,
        modelId: chat.settings.model,
        userContent: content,
        assistantMessage,
        priorMessages,
        ui: this.store.getState().ui,
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
        const currentList = this.store.getState().messages[this.chatId] ?? [];
        const current = currentList.find((m) => m.id === assistantMessage.id);
        const base = (current as Message | undefined) ?? assistantMessage;
        const finalMsg: Message = lifecycle.buildShortCircuitMessage({
          ...base,
          content: base.content ?? '',
          reasoning: base.reasoning,
          attachments: base.attachments,
          tutor: (base as any)?.tutor,
          hiddenContent: (base as any)?.hiddenContent,
        });
        this.updateMessage(assistantMessage.id, finalMsg);
        await this.persistMessage(finalMsg);
        const planArtifacts: PlanTurnResult =
          lifecycle.latestPlan() ??
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
            providerSort: runArtifacts.composition.providerSort,
            shouldPlan: runArtifacts.composition.shouldPlan,
          },
          plan: planArtifacts,
          tutorUi: this.store.getState().ui.tutorByMessageId?.[assistantMessage.id],
          toolCalls: finalMsg.toolCalls,
          debugPayload: this.store.getState().ui.debugByMessageId?.[assistantMessage.id]?.body,
        });
      }

      const messageList = this.store.getState().messages[this.chatId] ?? [];
      finalAssistant = messageList.find((msg) => msg.id === assistantMessage.id);
    } catch (error) {
      const text =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
      const fallback = this.updateMessage(assistantMessage.id, {
        content: `Tutor execution error: ${text}`,
      });
      finalAssistant = fallback ?? assistantMessage;
    } finally {
      clearTurnController(this.chatId);
      this.store.setState((draft) => ({
        ui: { ...draft.ui, isStreaming: false },
      }));
    }

    const finalMessages = this.store.getState().messages[this.chatId] ?? [];
    const assistantFinal =
      finalAssistant ?? finalMessages.find((msg) => msg.id === assistantMessage.id);
    if (!assistantFinal) throw new Error('Assistant message missing after streaming');
    const planArtifacts: PlanTurnResult =
      lifecycle.latestPlan() ??
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
        providerSort: runArtifacts?.composition.providerSort,
        shouldPlan: runArtifacts?.composition.shouldPlan ?? false,
      },
      plan: planArtifacts,
      tutorUi: this.store.getState().ui.tutorByMessageId?.[assistantMessage.id],
      toolCalls: assistantFinal.toolCalls,
      debugPayload: this.store.getState().ui.debugByMessageId?.[assistantMessage.id]?.body,
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
