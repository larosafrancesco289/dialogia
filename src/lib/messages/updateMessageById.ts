import type { Message } from '@/lib/types';

type MessageState = {
  messagesById: Record<string, Message>;
  messageIdsByChatId: Record<string, string[]>;
};

export function updateMessageById<S extends MessageState>(
  state: S,
  chatId: string,
  messageId: string,
  updater: (message: Message) => Message,
): Partial<S> | undefined {
  const message = state.messagesById[messageId];
  if (!message || message.chatId !== chatId) return undefined;
  const nextMessage = updater(message);
  if (nextMessage === message) return undefined;
  return {
    messagesById: {
      ...state.messagesById,
      [messageId]: nextMessage,
    },
  } as Partial<S>;
}
