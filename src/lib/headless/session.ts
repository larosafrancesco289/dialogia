import { v4 as uuidv4 } from 'uuid';
import type { StoreApi } from 'zustand/vanilla';
import { createHeadlessStore, type HeadlessStoreOptions } from '@/lib/headless/store';
import type { StoreState, UIState } from '@/lib/store/types';
import type {
  Chat,
  LearnerModel,
  Message,
  ModelTransport,
  ORModel,
  ToolCallLogEntry,
} from '@/lib/types';
import { type PlanTurnResult, type ModelMessage, type PersistMessage, type TurnComposition } from '@/lib/agent/types';
import { composeTurn } from '@/lib/agent/compose';
import { planTurn } from '@/lib/agent/planning';
import { streamFinal } from '@/lib/agent/streaming';
import { snapshotGenSettings } from '@/lib/agent/generation';
import { DEFAULT_BASE_SYSTEM, shouldShortCircuitTutor } from '@/lib/agent/policy';
import { resolveModelTransport } from '@/lib/providers';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import { getLatestLearnerModel, initializeLearnerModel } from '@/lib/agent/learnerModel';
import type { ModelIndex } from '@/lib/models';

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
    const chat = state.chats.find((c) => c.id === this.chatId);
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

    const composition = await composeTurn({
      chat,
      ui: this.store.getState().ui,
      modelIndex: this.store.getState().modelIndex,
      prior: priorMessages,
      newUser: { content },
      attachments: [],
    });

    const transport = resolveModelTransport(
      chat.settings.model,
      this.store.getState().modelIndex.get(chat.settings.model),
    );
    const apiKey = this.resolveApiKey({ modelId: chat.settings.model, transport });
    if (!apiKey) throw new Error(`Missing API key for ${transport} transport`);

    const controller = new AbortController();
    setTurnController(this.chatId, controller);

    let pendingLearnerModel: LearnerModel | undefined;
    let pendingPlanUpdates: Message['planUpdates'] | undefined;
    let planResult: PlanTurnResult = {
      finalSystem:
        composition.system ??
        chat.settings.system ??
        DEFAULT_BASE_SYSTEM,
      usedTutorContentTool: false,
      hasSearchResults: false,
    };

    const tutorEnabled = composition.tutor.enabled;
    let priorLearnerModel: LearnerModel | undefined;
    if (tutorEnabled && chat.settings.learningPlan) {
      priorLearnerModel = getLatestLearnerModel(priorMessages);
      if (!priorLearnerModel) {
        priorLearnerModel = initializeLearnerModel(this.chatId, chat.settings.learningPlan);
      }
    }

    const attachLearnerContextToAssistant = () => {
      if (!pendingLearnerModel && !pendingPlanUpdates) return;
      const patch: Partial<Message> = {};
      if (pendingLearnerModel) patch.learnerModel = pendingLearnerModel;
      if (pendingPlanUpdates) patch.planUpdates = pendingPlanUpdates;
      this.updateMessage(assistantMessage.id, patch);
    };

    let finalAssistant: Message | undefined;

    try {
      if (composition.shouldPlan) {
        const plan = await planTurn({
          chat,
          chatId: this.chatId,
          assistantMessage,
          userContent: content,
          combinedSystem: composition.system,
          baseMessages: composition.messages as ModelMessage[],
          toolDefinition: composition.tools,
          searchEnabled: composition.search.enabled,
          searchProvider: composition.search.provider,
          providerSort: composition.providerSort,
          apiKey,
          transport,
          controller,
          set: this.store.setState.bind(this.store),
          get: this.store.getState.bind(this.store),
          models: this.store.getState().models,
          modelIndex: this.store.getState().modelIndex,
          persistMessage: this.persistMessage,
        });
        planResult = plan;

        if (plan.learnerModel) pendingLearnerModel = plan.learnerModel;
        if (plan.planUpdates) pendingPlanUpdates = plan.planUpdates;

        if (plan.updatedPlan) {
          this.store.setState((draft) => ({
            chats: draft.chats.map((c) =>
              c.id === chat.id
                ? { ...c, settings: { ...c.settings, learningPlan: plan.updatedPlan } }
                : c,
            ),
          }));
        }

        if (plan.learnerModel && plan.learnerModelDebug && priorLearnerModel) {
          this.store.setState((draft) => ({
            ui: {
              ...draft.ui,
              learnerModelDebugByMessageId: {
                ...(draft.ui.learnerModelDebugByMessageId || {}),
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

        try {
          const modelMeta = this.store.getState().modelIndex.get(chat.settings.model);
          const genSettings = snapshotGenSettings({
            settings: chat.settings,
            modelMeta,
            searchProvider: composition.search.provider,
            providerSort: composition.providerSort,
          });
          this.updateMessage(assistantMessage.id, {
            systemSnapshot: plan.finalSystem,
            genSettings: genSettings as Message['genSettings'],
          });
        } catch {
          // best-effort snapshot
        }

        if (shouldShortCircuitTutor(plan)) {
          const currentList = this.store.getState().messages[this.chatId] ?? [];
          const current = currentList.find((m) => m.id === assistantMessage.id);
          const base = (current as Message | undefined) ?? assistantMessage;
          const finalMsg: Message = {
            ...base,
            content: base.content ?? '',
            reasoning: base.reasoning,
            attachments: base.attachments,
            tutor: (base as any)?.tutor,
            hiddenContent: (base as any)?.hiddenContent,
            learnerModel: pendingLearnerModel ?? base.learnerModel,
            planUpdates: pendingPlanUpdates ?? base.planUpdates,
          };
          this.updateMessage(assistantMessage.id, finalMsg);
          await this.persistMessage(finalMsg);
          return this.finishTurn(userMessage, finalMsg, {
            composition: {
              system: composition.system,
              tools: composition.tools,
              plugins: composition.plugins,
              providerSort: composition.providerSort,
              shouldPlan: composition.shouldPlan,
            },
            plan,
            tutorUi: this.store.getState().ui.tutorByMessageId?.[assistantMessage.id],
            toolCalls: finalMsg.toolCalls,
            debugPayload: this.store.getState().ui.debugByMessageId?.[assistantMessage.id]?.body,
          });
        }
      }

      attachLearnerContextToAssistant();

      const streamMessages: ModelMessage[] =
        composition.shouldPlan && planResult.finalSystem
          ? ([{ role: 'system', content: planResult.finalSystem }] as ModelMessage[]).concat(
              (composition.messages as ModelMessage[]).filter((m) => m.role !== 'system'),
            )
          : (composition.messages as ModelMessage[]);

      await streamFinal({
        chat,
        chatId: this.chatId,
        assistantMessage,
        messages: streamMessages,
        controller,
        apiKey,
        transport,
        providerSort: composition.providerSort,
        set: this.store.setState.bind(this.store),
        get: this.store.getState.bind(this.store),
        models: this.store.getState().models,
        modelIndex: this.store.getState().modelIndex,
        persistMessage: this.persistMessage,
        plugins: composition.plugins,
        toolDefinition: composition.tools,
        startBuffered: false,
      });

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

    return this.finishTurn(userMessage, assistantFinal, {
      composition: {
        system: composition.system,
        tools: composition.tools,
        plugins: composition.plugins,
        providerSort: composition.providerSort,
        shouldPlan: composition.shouldPlan,
      },
      plan: planResult,
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
