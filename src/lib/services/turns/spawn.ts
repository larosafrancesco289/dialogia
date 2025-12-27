import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import type { Repository } from '@/lib/db/repository';
import type { PersistedAttachment, Message } from '@/lib/types';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { createMessagePersister } from '@/lib/services/messagePersistence';

export type SpawnMessagesResult = {
  userMessage: Message;
  assistantByModel: Map<string, Message>;
  masterController: AbortController;
  markComplete: () => void;
  completeAll: () => void;
};

export const spawnTurnMessages = async ({
  chatId,
  content,
  metadata,
  primaryAttachments,
  activeModelIds,
  set,
  get: _get,
  repository,
}: {
  chatId: string;
  content: string;
  metadata?: Message['metadata'];
  primaryAttachments: PersistedAttachment[];
  activeModelIds: string[];
  set: StoreSetter;
  get: StoreGetter;
  repository: Repository;
}): Promise<SpawnMessagesResult | null> => {
  if (!activeModelIds.length) return null;
  const now = Date.now();
  const userMessage = createUserMessage({
    chatId,
    content,
    createdAt: now,
    attachments: primaryAttachments.length ? primaryAttachments : undefined,
    metadata: metadata || undefined,
  });

  const assistantPlaceholders = activeModelIds.map((modelId, index) =>
    createAssistantMessage({
      chatId,
      content: '',
      createdAt: now + 1 + index,
      model: modelId,
      attachments: [],
    }),
  );
  const assistantByModel = new Map<string, Message>();
  assistantPlaceholders.forEach((msg, index) => {
    const modelId = activeModelIds[index];
    assistantByModel.set(modelId, msg);
  });

  const masterController = new AbortController();
  setTurnController(chatId, masterController);
  let pendingStreams = assistantPlaceholders.length;
  if (pendingStreams === 0) {
    clearTurnController(chatId, masterController);
    return null;
  }

  const markComplete = () => {
    if (pendingStreams <= 0) return;
    pendingStreams -= 1;
    const stillRunning = pendingStreams > 0;
    set((state) => ({ ui: { ...state.ui, isStreaming: stillRunning } }));
    if (!stillRunning) clearTurnController(chatId, masterController);
  };

  const completeAll = () => {
    pendingStreams = 0;
    set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
    clearTurnController(chatId, masterController);
  };

  set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: [...(state.messages[chatId] ?? []), userMessage, ...assistantPlaceholders],
    },
    ui: { ...state.ui, isStreaming: true },
  }));

  const persistMessage = createMessagePersister(repository);
  await persistMessage(userMessage);
  for (const placeholder of assistantPlaceholders) {
    await persistMessage(placeholder);
  }

  return { userMessage, assistantByModel, masterController, markComplete, completeAll };
};
