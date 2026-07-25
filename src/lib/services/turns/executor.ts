// Module: services/turns/executor
// Responsibility: Execute one model turn (compose, plan, stream) and manage lifecycle hooks.

import { handleTurnApiError } from '@/lib/services/turns/errors';
import { createTurnLifecycle } from '@/lib/agent/orchestrator/lifecycle';
import { runTurn } from '@/lib/agent/orchestrator/turn';
import { composeTurn } from '@/lib/agent/compose';
import { planTurn } from '@/lib/agent/planning';
import { applyPlanSideEffects } from '@/lib/agent/planning/sideEffects';
import { streamFinal } from '@/lib/agent/streaming';
import { shouldShortCircuitTutor } from '@/lib/agent/policy';
import type { Repository } from '@/lib/db/repository';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { finalizeShortCircuitMessage } from '@/lib/services/turns/shortCircuit';
import type { TurnRuntimeContext } from '@/lib/turns/runtime';
import type { Chat, Message, PersistedAttachment } from '@/lib/types';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { resolveTurnSettings } from '@/lib/settings/resolve';

export type ExecuteModelTurnArgs = {
  modelId: string;
  isPrimary: boolean;
  assistantMessage?: Message;
  attachments: PersistedAttachment[];
  runtime: TurnRuntimeContext;
  content: string;
  priorMessages: Message[];
  masterController: AbortController;
  markComplete: () => void;
  set: StoreSetter;
  get: StoreGetter;
  getCurrentChat: () => Chat;
  updateChat: (chat: Chat) => void;
  repository: Repository;
};

export const executeModelTurn = async ({
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
  repository,
}: ExecuteModelTurnArgs): Promise<void> => {
  if (!assistantMessage) {
    markComplete();
    return;
  }
  const controller = new AbortController();
  const abortListener = () => controller.abort();
  masterController.signal.addEventListener('abort', abortListener);

  try {
    const chatForTurn = (): Chat => {
      const chat = getCurrentChat();
      return {
        ...chat,
        settings: { ...chat.settings, modelId },
      };
    };

    const baseTurnContext = {
      ...runtime.baseTurnContext,
      models: get().models,
      modelIndex: get().modelIndex,
    };

    const persistMessage = createMessagePersister(repository);
    const updateMessage = (messageId: string, patch: Partial<Message>) => {
      set((state) => {
        const next = updateMessageById(state, runtime.chatId, messageId, (message) => ({
          ...message,
          ...patch,
        }));
        return next ?? state;
      });
    };

    const lifecycle = createTurnLifecycle({
      chatId: runtime.chatId,
      assistantMessageId: assistantMessage.id,
      isPrimary,
      priorMessages,
      getChatForTurn: chatForTurn,
      set,
      get,
      updateChat,
      persistChat: repository.saveChat,
      updateMessage: (patch) => updateMessage(assistantMessage.id, patch),
    });

    const modelContext = runtime.modelContexts.get(modelId);
    if (!modelContext) {
      masterController.signal.removeEventListener('abort', abortListener);
      markComplete();
      return;
    }

    const chatForModel = chatForTurn();
    const settings = resolveTurnSettings({
      chat: chatForModel,
      ui: runtime.ui,
      modelIndex: baseTurnContext.modelIndex,
      modelId,
    });

    const runResult = await runTurn({
      chat: chatForModel,
      chatId: runtime.chatId,
      modelId,
      userContent: content,
      assistantMessage,
      priorMessages,
      ui: runtime.ui,
      settings,
      controller,
      baseTurnContext,
      compose: composeTurn,
      plan: planTurn,
      streamFinal,
      authResolver: () => modelContext.auth,
      attachmentPreparer: async () => attachments,
      fallbackAttachments: attachments,
      shouldShortCircuit: shouldShortCircuitTutor,
      hooks: {
        ...lifecycle.hooks,
        onPlanSideEffects: (effects) => applyPlanSideEffects({ sideEffects: effects, set }),
      },
    });

    if (runResult.shortCircuited) {
      await finalizeShortCircuitMessage({
        assistantMessage,
        lifecycle,
        getState: get,
        updateMessage,
        persistMessage,
      });
      return;
    }
  } catch (error: unknown) {
    handleTurnApiError(error, set, get, runtime.chatId);
    controller.abort();
  } finally {
    masterController.signal.removeEventListener('abort', abortListener);
    markComplete();
  }
};
