import type { Message } from '@/lib/types';
import type { MessageIndexState } from '@/lib/messages/indexing';
import { updateMessageById } from '@/lib/messages/updateMessageById';

type MessageState = MessageIndexState;

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
