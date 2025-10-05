import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import type { StoreSetter } from '@/lib/agent/types';
import { saveMessage } from '@/lib/db';
import {
  appendAssistantTurn,
  persistTutorForMessage,
  sendUserTurn,
  regenerateTurn,
} from '@/lib/services/turns';
import { abortAllTurns } from '@/lib/services/controllers';

// telemetry removed for commit cleanliness

export function createMessageSlice(
  set: StoreSetter,
  get: () => StoreState,
  _store?: unknown,
) {
  return {
    async appendAssistantMessage(content: string, opts?: { modelId?: string }) {
      await appendAssistantTurn({ content, modelId: opts?.modelId, set, get });
    },

    async persistTutorStateForMessage(messageId) {
      await persistTutorForMessage({ messageId, store: { set, get } });
    },

    async sendUserMessage(
      content: string,
      opts?: { attachments?: import('@/lib/types').Attachment[] },
    ) {
      await sendUserTurn({ content, attachments: opts?.attachments, set, get });
    },

    stopStreaming() {
      abortAllTurns();
      set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
    },

    async editUserMessage(messageId, newContent, opts) {
      const chatId = get().selectedChatId!;
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = list[idx];
      if (target.role !== 'user') return;
      const updated = { ...target, content: newContent };
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)),
        },
      }));
      await saveMessage(updated);
      if (opts?.rerun) {
        if (get().ui.isStreaming) get().stopStreaming();
        const nextAssistant = (get().messages[chatId] ?? [])
          .slice(idx + 1)
          .find((m) => m.role === 'assistant');
        if (nextAssistant)
          get()
            .regenerateAssistantMessage(nextAssistant.id)
            .catch(() => void 0);
      }
    },

    async editAssistantMessage(messageId, newContent) {
      const chatId = get().selectedChatId!;
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = list[idx];
      if (target.role !== 'assistant') return;
      const updated = { ...target, content: newContent } as Message;
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)),
        },
      }));
      await saveMessage(updated);
    },

    async regenerateAssistantMessage(messageId, opts) {
      await regenerateTurn({ messageId, overrideModelId: opts?.modelId, set, get });
    },
  } satisfies Partial<StoreState>;
}
