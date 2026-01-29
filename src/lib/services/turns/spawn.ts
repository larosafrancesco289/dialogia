// Module: services/turns/spawn
// Responsibility: Create placeholder messages and wire abort controllers for new turns.

import { setTurnController, clearTurnController } from '@/lib/turnRuntime/abortControllers';
import type { Repository } from '@/lib/db/repository';
import type { PersistedAttachment, Message } from '@/lib/types';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { persistMessages } from '@/lib/services/messagePersistence';
import { appendMessagesToChat } from '@/lib/messages/indexing';
import { adjustActiveTurnCount, clearActiveTurnCount } from '@/lib/ui/streaming';
import { logAction } from '@/lib/study';

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
    set((state) => ({
      ui: adjustActiveTurnCount(state.ui, chatId, -1),
    }));
    if (pendingStreams <= 0) clearTurnController(chatId, masterController);
  };

  const completeAll = () => {
    pendingStreams = 0;
    set((state) => ({ ui: clearActiveTurnCount(state.ui, chatId) }));
    clearTurnController(chatId, masterController);
  };

  set((state) => ({
    ...appendMessagesToChat(state, chatId, [userMessage, ...assistantPlaceholders]),
    ui: adjustActiveTurnCount(state.ui, chatId, assistantPlaceholders.length),
  }));

  await persistMessages(repository, [userMessage, ...assistantPlaceholders]);

  // Log message sent for study tracking
  logAction('message_sent', {
    messageId: userMessage.id,
    contentLength: content.length,
    isHiddenFromUser: !!metadata?.hiddenFromUser,
  });

  return { userMessage, assistantByModel, masterController, markComplete, completeAll };
};
