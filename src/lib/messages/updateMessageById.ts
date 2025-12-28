import type { Message } from '@/lib/types';

type MessageState = {
  messages: Record<string, Message[]>;
};

export function updateMessageById<S extends MessageState>(
  state: S,
  chatId: string,
  messageId: string,
  updater: (message: Message) => Message,
): Partial<S> | undefined {
  const list = state.messages[chatId];
  if (!Array.isArray(list) || list.length === 0) return undefined;
  let changed = false;
  const nextList = list.map((message) => {
    if (message.id !== messageId) return message;
    const nextMessage = updater(message);
    if (nextMessage !== message) changed = true;
    return nextMessage;
  });
  if (!changed) return undefined;
  return {
    messages: {
      ...state.messages,
      [chatId]: nextList,
    },
  } as Partial<S>;
}
