import type { Chat } from '@/lib/types/chat';
import type { LearnerModel } from '@/lib/types';
import type { StoreSetter } from '@/lib/agent/types';

/**
 * Persist learner model to chat settings for reliable retrieval
 */
export async function persistLearnerModel(opts: {
  chat: Chat;
  chatId: string;
  learnerModel: LearnerModel;
  set: StoreSetter;
  updateChat?: (chat: Chat) => void;
  persistChat?: (chat: Chat) => Promise<void> | void;
}): Promise<Chat> {
  const { chat, chatId, learnerModel, set, updateChat, persistChat } = opts;
  const updatedChat: Chat = {
    ...chat,
    settings: {
      ...chat.settings,
      features: {
        ...chat.settings.features,
        tutor: {
          ...chat.settings.features.tutor,
          learnerModel,
        },
      },
    },
    updatedAt: Date.now(),
  };
  set((state) => ({
    chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)),
  }));
  updateChat?.(updatedChat);
  try {
    await persistChat?.(updatedChat);
  } catch {
    /* best effort */
  }
  return updatedChat;
}
