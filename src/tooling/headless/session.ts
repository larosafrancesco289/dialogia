import type { StoreApi } from 'zustand/vanilla';
import { createHeadlessStore, type HeadlessStoreOptions } from '@/tooling/headless/store';
import type { StoreState, UIState } from '@/lib/store/types';
import type { Chat, Message, ModelTransport, ModelDescriptor } from '@/lib/types';
import { type PlanTurnResult, type PersistMessage, type TurnContext } from '@/lib/agent/types';
import { composeTurn } from '@/lib/agent/compose';
import { planTurn } from '@/lib/agent/planning';
import { applyPlanSideEffects } from '@/lib/agent/planning/sideEffects';
import { streamFinal } from '@/lib/agent/streaming';
import { mergeTutorPayload } from '@/lib/agent/tutorFlow';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import { shouldShortCircuitTutor } from '@/lib/agent/policy';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { resolveModelTransport } from '@/lib/providers';
import { setTurnController, clearTurnController } from '@/lib/turns/runtime';
import type { ModelIndex } from '@/lib/models';
import { runTurn } from '@/lib/agent/orchestrator/turn';
import { createTurnLifecycle } from '@/lib/agent/orchestrator/lifecycle';
import { finalizeShortCircuitMessage } from '@/lib/services/turns/shortCircuit';
import type { HeadlessTurnArtifacts, HeadlessTurnResult } from '@/tooling/headless/types';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { adjustActiveTurnCount } from '@/lib/ui/streaming';
import type { TransportAuth } from '@/lib/auth/transport';
import { getNextNode, updateNodeStatus } from '@/lib/learning-plan/service';
import { initializeLearnerModel, syncLearnerModelWithPlan } from '@/lib/agent/learner-model';

export type AuthResolver = (params: {
  modelId: string;
  transport: ModelTransport;
}) => TransportAuth | null;

export type ApiKeyResolver = AuthResolver;

export type HeadlessTutorSessionOptions = {
  chat: Chat;
  models?: ModelDescriptor[];
  modelIndex?: ModelIndex;
  uiOverrides?: Partial<UIState>;
  initialMessages?: Message[];
  resolveAuth: AuthResolver;
  store?: StoreApi<StoreState>;
  pipeline?: PipelineClient;
};

export class HeadlessTutorSession {
  private readonly store: StoreApi<StoreState>;
  private readonly resolveAuth: AuthResolver;
  private readonly chatId: string;
  private readonly pipeline?: PipelineClient;

  constructor(private readonly options: HeadlessTutorSessionOptions) {
    this.resolveAuth = options.resolveAuth;
    this.pipeline = options.pipeline;
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
    return getMessagesForChat(this.store.getState(), this.chatId);
  }

  private persistMessage: PersistMessage = async (message) => {
    this.store.setState((state) => {
      const existing = state.messagesById[message.id];
      if (!existing) return state;
      return {
        messagesById: {
          ...state.messagesById,
          [message.id]: { ...message },
        },
      };
    });
  };

  private updateMessage(messageId: string, patch: Partial<Message>): Message | undefined {
    let updated: Message | undefined;
    this.store.setState((state) => {
      const message = state.messagesById[messageId];
      if (!message) return state;
      updated = { ...message, ...patch } as Message;
      return {
        messagesById: {
          ...state.messagesById,
          [messageId]: updated,
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
      model: chat.settings.modelId,
    });

    const priorMessages = getMessagesForChat(this.store.getState(), this.chatId);
    this.store.setState((draft) => {
      return {
        ...appendMessagesToChat(draft, this.chatId, [userMessage, assistantMessage]),
        ui: adjustActiveTurnCount(draft.ui, this.chatId, 1),
      };
    });

    const controller = new AbortController();
    setTurnController(this.chatId, controller);

    const baseTurnContext: Omit<TurnContext, 'auth'> = {
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
      const auth = this.resolveAuth({ modelId, transport });
      if (!auth) throw new Error(`Missing auth for ${transport} transport`);
      return auth;
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
        modelId: chat.settings.modelId,
      });

      const plan = (options: Parameters<typeof planTurn>[0]) =>
        planTurn({ ...options, pipeline: this.pipeline });
      const stream = (options: Parameters<typeof streamFinal>[0]) =>
        streamFinal({ ...options, pipeline: this.pipeline });

      runArtifacts = await runTurn({
        chat,
        chatId: this.chatId,
        modelId: chat.settings.modelId,
        userContent: content,
        assistantMessage,
        priorMessages,
        ui: this.store.getState().ui,
        settings,
        controller,
        baseTurnContext,
        compose: composeTurn,
        plan,
        streamFinal: stream,
        authResolver,
        attachmentPreparer: async () => [],
        shouldShortCircuit: shouldShortCircuitTutor,
        hooks: {
          ...lifecycle.hooks,
          onPlanSideEffects: (effects) =>
            applyPlanSideEffects({
              sideEffects: effects,
              set: this.store.setState.bind(this.store),
            }),
        },
        pipeline: this.pipeline,
      });

      if (runArtifacts.shortCircuited) {
        const finalMsg = await finalizeShortCircuitMessage({
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

      finalAssistant = this.store.getState().messagesById[assistantMessage.id];
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
        ui: adjustActiveTurnCount(draft.ui, this.chatId, -1),
      }));
    }

    const assistantFinal =
      finalAssistant ?? this.store.getState().messagesById[assistantMessage.id];
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
    // Auto-approve any pending plan proposals in headless mode
    this.autoApprovePendingPlanProposal(assistant.id);

    return {
      user,
      assistant,
      artifacts,
    };
  }

  /**
   * Auto-approve pending plan proposals in headless mode.
   * In UI mode, the user clicks "Approve plan" in PlanProposalCard.
   * In headless/ablation mode, we auto-approve to test editability.
   */
  private autoApprovePendingPlanProposal(messageId: string): void {
    const state = this.store.getState();
    const tutorState = state.ui.tutor.byMessageId?.[messageId];
    const planProposal = tutorState?.planProposal;

    if (!planProposal || planProposal.status !== 'pending') {
      return;
    }

    const chat = state.chats.find((c) => c.id === this.chatId);
    if (!chat) return;

    const now = Date.now();
    let adoptedPlan = { ...planProposal.plan, updatedAt: now };

    // Ensure at least one node is in_progress
    const hasInProgress = adoptedPlan.nodes.some((n) => n.status === 'in_progress');
    if (!hasInProgress && adoptedPlan.nodes.length > 0) {
      const firstReady = getNextNode(adoptedPlan) || adoptedPlan.nodes[0];
      adoptedPlan = updateNodeStatus(adoptedPlan, firstReady.id, 'in_progress');
    }

    // Initialize or sync learner model
    const existingModel = chat.settings.features.tutor.learnerModel;
    const learnerModel = existingModel
      ? syncLearnerModelWithPlan(existingModel, adoptedPlan)
      : initializeLearnerModel(chat.id, adoptedPlan);

    const nextPlanProposal = {
      ...planProposal,
      plan: adoptedPlan,
      status: 'approved' as const,
      resolvedAt: now,
    };

    // Apply the plan to chat settings and sync tutor payloads
    this.store.setState((draft) => ({
      chats: draft.chats.map((c) =>
        c.id === this.chatId
          ? {
              ...c,
              settings: {
                ...c.settings,
                features: {
                  ...c.settings.features,
                  tutor: {
                    ...c.settings.features.tutor,
                    learningPlan: adoptedPlan,
                    planGenerated: true,
                    enableLearnerModel: true,
                    learnerModel,
                  },
                },
              },
              updatedAt: now,
            }
          : c,
      ),
      ui: {
        ...draft.ui,
        tutor: {
          ...draft.ui.tutor,
          byMessageId: {
            ...draft.ui.tutor.byMessageId,
            [messageId]: {
              ...(draft.ui.tutor.byMessageId?.[messageId] || {}),
              planProposal: nextPlanProposal,
            },
          },
        },
      },
      ...(draft.messagesById[messageId]
        ? (() => {
            const currentMessage = draft.messagesById[messageId];
            const { merged, hiddenContent } = mergeTutorPayload(currentMessage.tutor, {
              planProposal: nextPlanProposal,
            });
            return {
              messagesById: {
                ...draft.messagesById,
                [messageId]: { ...currentMessage, tutor: merged, hiddenContent },
              },
            };
          })()
        : {}),
    }));
  }
}
