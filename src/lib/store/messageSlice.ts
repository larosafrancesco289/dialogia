import type { StoreSetter, StoreState } from '@/lib/store/types';
import type { DraftAttachment, Message } from '@/lib/types';
import { repository } from '@/lib/db';
import { abortAllTurns, abortTurn } from '@/lib/turns/runtime/abortControllers';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { isChatStreaming } from '@/lib/ui/streaming';
import { canRedoReply } from '@/lib/modules';
import { notify } from '@/lib/store/notify';
import { NOTICE_REPLY_IN_OTHER_TAB } from '@/lib/store/notices';

// telemetry removed for commit cleanliness

// The turn pipeline (agent orchestrator, planning, streaming, tools) is only
// reachable from user actions, so it loads on first use instead of at boot.
const loadTurnService = () => import('@/lib/services/turns');

export type MessageSliceState = {
  messagesById: Record<string, Message>;
  messageIdsByChatId: Record<string, string[]>;
};

export type MessageSliceActions = {
  appendAssistantMessage: (content: string, opts?: { modelId?: string }) => Promise<void>;
  sendUserMessage: (
    content: string,
    opts?: {
      attachments?: DraftAttachment[];
      metadata?: Message['metadata'];
      /** Records an interface action rather than typed words; see `Message.ledger`. */
      ledger?: boolean;
    },
  ) => Promise<void>;
  stopStreaming: () => void;
  editUserMessage: (
    messageId: string,
    newContent: string,
    opts?: { rerun?: boolean },
  ) => Promise<void>;
  editAssistantMessage: (messageId: string, newContent: string) => Promise<void>;
  regenerateAssistantMessage: (messageId: string, opts?: { modelId?: string }) => Promise<void>;
};

export function createMessageSlice(
  set: StoreSetter,
  get: () => StoreState,
  _store?: unknown,
): MessageSliceState & MessageSliceActions {
  const persistMessage = createMessagePersister(repository);
  // A turn started while another tab is writing in the same chat would build
  // its request without that reply, and the stored transcript would then
  // interleave two turns neither model saw together.
  const busyInOtherTab = (chatId?: string) => {
    if (!chatId || !get().repliesInOtherTabs[chatId]?.length) return false;
    notify(get, NOTICE_REPLY_IN_OTHER_TAB, 'info');
    return true;
  };
  return {
    messagesById: {},
    messageIdsByChatId: {},

    async appendAssistantMessage(content: string, opts?: { modelId?: string }) {
      const { appendAssistantTurn } = await loadTurnService();
      await appendAssistantTurn({
        content,
        modelId: opts?.modelId,
        set,
        get,
        repository,
      });
    },

    async sendUserMessage(content, opts) {
      const chatId = get().selectedChatId;
      if (busyInOtherTab(chatId)) return;
      if (chatId) await get().ensureChatMessagesLoaded(chatId);
      const { sendUserTurn } = await loadTurnService();
      await sendUserTurn({
        content,
        attachments: opts?.attachments,
        metadata: opts?.metadata,
        ledger: opts?.ledger,
        set,
        get,
        repository,
      });
    },

    // Aborting is the whole of it: each turn counts itself out as it ends.
    // Zeroing the count here would let a stopped turn that ends later take a
    // newer turn's share with it.
    stopStreaming() {
      const chatId = get().selectedChatId;
      if (chatId) {
        abortTurn(chatId);
      } else {
        abortAllTurns();
      }
    },

    async editUserMessage(messageId, newContent, opts) {
      const chatId = get().selectedChatId!;
      const list = getMessagesForChat(get(), chatId);
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = list[idx];
      if (target.role !== 'user') return;
      if (opts?.rerun && !canRedoReply(get(), chatId, messageId)) return;
      if (opts?.rerun && busyInOtherTab(chatId)) return;
      const updated = { ...target, content: newContent };
      set((s) => ({
        messagesById: {
          ...s.messagesById,
          [messageId]: updated,
        },
      }));
      await persistMessage(updated);
      if (opts?.rerun) {
        if (isChatStreaming(get().ui, chatId)) get().stopStreaming();
        const nextAssistant = list.slice(idx + 1).find((m) => m.role === 'assistant');
        let rerunTargetId = nextAssistant?.id;
        if (!rerunTargetId) {
          // No assistant reply exists after this message (e.g. the turn failed
          // before one was saved) — spawn a placeholder so the edit still reruns.
          const chat = get().chats.find((c) => c.id === chatId);
          const placeholder = createAssistantMessage({
            chatId,
            content: '',
            createdAt: Date.now(),
            model: chat?.settings.modelId,
          });
          set((s) => appendMessagesToChat(s, chatId, [placeholder]));
          await persistMessage(placeholder);
          rerunTargetId = placeholder.id;
        }
        get()
          .regenerateAssistantMessage(rerunTargetId)
          .catch(() => void 0);
      }
    },

    async editAssistantMessage(messageId, newContent) {
      const chatId = get().selectedChatId!;
      const list = getMessagesForChat(get(), chatId);
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = list[idx];
      if (target.role !== 'assistant') return;
      const updated = { ...target, content: newContent } as Message;
      set((s) => ({
        messagesById: {
          ...s.messagesById,
          [messageId]: updated,
        },
      }));
      await persistMessage(updated);
    },

    async regenerateAssistantMessage(messageId, opts) {
      if (busyInOtherTab(get().messagesById[messageId]?.chatId)) return;
      const { regenerateTurn } = await loadTurnService();
      await regenerateTurn({ messageId, overrideModelId: opts?.modelId, set, get, repository });
    },
  } satisfies Partial<StoreState>;
}
