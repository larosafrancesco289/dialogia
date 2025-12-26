import type { Message } from '@/lib/types';

type MessageState = {
  messages: Record<string, Message[]>;
};

export function updateMessageInChat<S extends MessageState>(
  state: S,
  chatId: string,
  messageId: string,
  patch: Partial<Message>,
): Partial<S> {
  const list = state.messages[chatId];
  if (!Array.isArray(list) || list.length === 0) {
    return {};
  }
  let changed = false;
  const nextList = list.map((message) => {
    if (message.id !== messageId) return message;
    changed = true;
    return { ...message, ...patch } as Message;
  });
  if (!changed) return {};
  return {
    messages: {
      ...state.messages,
      [chatId]: nextList,
    },
  } as Partial<S>;
}
