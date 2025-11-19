import { v4 as uuidv4 } from 'uuid';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import { saveMessage } from '@/lib/db';
import type { Attachment, Message } from '@/lib/types';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';

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
  get,
}: {
  chatId: string;
  content: string;
  metadata?: Message['metadata'];
  primaryAttachments: Attachment[];
  activeModelIds: string[];
  set: StoreSetter;
  get: StoreGetter;
}): Promise<SpawnMessagesResult | null> => {
  if (!activeModelIds.length) return null;
  const now = Date.now();
  const userMessage: Message = {
    id: uuidv4(),
    chatId,
    role: 'user',
    content,
    createdAt: now,
    attachments: primaryAttachments.length ? primaryAttachments : undefined,
    metadata: metadata || undefined,
  };

  const assistantPlaceholders = activeModelIds.map((modelId, index) => ({
    id: uuidv4(),
    chatId,
    role: 'assistant',
    content: '',
    createdAt: now + 1 + index,
    model: modelId,
    reasoning: '',
    attachments: [],
    toolCalls: [],
  })) as Message[];
  const assistantByModel = new Map<string, Message>();
  assistantPlaceholders.forEach((msg, index) => {
    const modelId = activeModelIds[index];
    assistantByModel.set(modelId, msg);
  });

  const masterController = new AbortController();
  setTurnController(chatId, masterController);
  let pendingStreams = assistantPlaceholders.length;
  if (pendingStreams === 0) {
    clearTurnController(chatId);
    return null;
  }

  const markComplete = () => {
    if (pendingStreams <= 0) return;
    pendingStreams -= 1;
    const stillRunning = pendingStreams > 0;
    set((state) => ({ ui: { ...state.ui, isStreaming: stillRunning } }));
    if (!stillRunning) clearTurnController(chatId);
  };

  const completeAll = () => {
    pendingStreams = 0;
    set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
    clearTurnController(chatId);
  };

  set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: [...(state.messages[chatId] ?? []), userMessage, ...assistantPlaceholders],
    },
    ui: { ...state.ui, isStreaming: true },
  }));

  await saveMessage(userMessage);
  for (const placeholder of assistantPlaceholders) {
    await saveMessage(placeholder);
  }

  return { userMessage, assistantByModel, masterController, markComplete, completeAll };
};
