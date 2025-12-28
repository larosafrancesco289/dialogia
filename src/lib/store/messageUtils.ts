import type { Message } from '@/lib/types';
import { updateMessageById } from '@/lib/messages/updateMessageById';

type MessageState = {
  messages: Record<string, Message[]>;
};

export function updateMessageInChat<S extends MessageState>(
  state: S,
  chatId: string,
  messageId: string,
  patch: Partial<Message>,
): Partial<S> {
  const result = updateMessageById(state, chatId, messageId, (message) => ({
    ...message,
    ...patch,
  }));
  return result ?? {};
}
