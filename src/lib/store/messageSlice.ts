import type { StoreSetter, StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { repository } from '@/lib/db';
import {
  appendAssistantTurn,
  persistTutorForMessage,
  sendUserTurn,
  regenerateTurn,
} from '@/lib/services/turns';
import { abortAllTurns, abortTurn } from '@/lib/turns/runtime';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { clearActiveTurnCount, isChatStreaming } from '@/lib/ui/streaming';

// telemetry removed for commit cleanliness

export function createMessageSlice(set: StoreSetter, get: () => StoreState, _store?: unknown) {
  const persistMessage = createMessagePersister(repository);
  return {
    async appendAssistantMessage(content: string, opts?: { modelId?: string }) {
      await appendAssistantTurn({
        content,
        modelId: opts?.modelId,
        set,
        get,
        repository,
      });
    },

    async persistTutorStateForMessage(messageId) {
      await persistTutorForMessage({ messageId, store: { set, get }, repository });
    },

    async sendUserMessage(
      content: string,
      opts?: {
        attachments?: import('@/lib/types').DraftAttachment[];
        metadata?: import('@/lib/types').Message['metadata'];
      },
    ) {
      const chatId = get().selectedChatId;
      if (chatId) await get().ensureChatMessagesLoaded(chatId);
      await sendUserTurn({
        content,
        attachments: opts?.attachments,
        metadata: opts?.metadata,
        set,
        get,
        repository,
      });
    },

    stopStreaming() {
      const chatId = get().selectedChatId;
      if (chatId) {
        abortTurn(chatId);
      } else {
        abortAllTurns();
      }
      set((s) => ({
        ui: clearActiveTurnCount(s.ui, chatId),
      }));
    },

    async editUserMessage(messageId, newContent, opts) {
      const chatId = get().selectedChatId!;
      const list = getMessagesForChat(get(), chatId);
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = list[idx];
      if (target.role !== 'user') return;
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
      await regenerateTurn({ messageId, overrideModelId: opts?.modelId, set, get, repository });
    },
  } satisfies Partial<StoreState>;
}
