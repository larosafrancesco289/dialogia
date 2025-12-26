import { handleTurnApiError } from '@/lib/services/turns/errors';
import { createTurnLifecycle } from '@/lib/agent/orchestrator/lifecycle';
import { runTurn } from '@/lib/agent/orchestrator/turn';
import { composeTurn } from '@/lib/agent/compose';
import { planTurn } from '@/lib/agent/planning';
import { streamFinal } from '@/lib/agent/streaming';
import { shouldShortCircuitTutor } from '@/lib/agent/policy';
import { saveChat, saveMessage } from '@/lib/db';
import { updateMessageInChat } from '@/lib/store/messageUtils';
import { finalizeShortCircuitMessage } from '@/lib/services/turns/shortCircuit';
import type { SendRuntime } from '@/lib/services/turns/runtime';
import type { Chat, Message, PersistedAttachment } from '@/lib/types';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';

export type ExecuteModelTurnArgs = {
  modelId: string;
  isPrimary: boolean;
  assistantMessage?: Message;
  attachments: PersistedAttachment[];
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
        settings: { ...chat.settings, model: modelId },
      };
    };

    const baseTurnContext = {
      ...runtime.baseTurnContext,
      models: get().models,
      modelIndex: get().modelIndex,
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
      persistChat: saveChat,
      updateMessage: (patch) =>
        set((state) => updateMessageInChat(state, runtime.chatId, assistantMessage.id, patch)),
    });

    const modelContext = runtime.modelContexts.get(modelId);
    if (!modelContext) {
      masterController.signal.removeEventListener('abort', abortListener);
      markComplete();
      return;
    }

    const runResult = await runTurn({
      chat: chatForTurn(),
      chatId: runtime.chatId,
      modelId,
      userContent: content,
      assistantMessage,
      priorMessages,
      ui: get().ui,
      controller,
      baseTurnContext,
      compose: composeTurn,
      plan: planTurn,
      streamFinal,
      authResolver: () => modelContext.auth,
      attachmentPreparer: async () => attachments,
      fallbackAttachments: attachments,
      shouldShortCircuit: shouldShortCircuitTutor,
      hooks: lifecycle.hooks,
    });

    if (runResult.shortCircuited) {
      await finalizeShortCircuitMessage({
        chatId: runtime.chatId,
        assistantMessage,
        lifecycle,
        getState: get,
        updateMessage: (messageId, patch) =>
          set((state) => updateMessageInChat(state, runtime.chatId, messageId, patch)),
        persistMessage: saveMessage,
      });
      return;
    }

    const messageList = get().messages[runtime.chatId] ?? [];
    const finalAssistant = messageList.find((msg) => msg.id === assistantMessage.id);
    if (finalAssistant) {
      // Lifecycle already pushed gen settings/system snapshot; no-op here.
    }
  } catch (error: any) {
    handleTurnApiError(error, set);
    controller.abort();
  } finally {
    masterController.signal.removeEventListener('abort', abortListener);
    markComplete();
  }
};
