import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';

export function updateMessageInChat(
  state: StoreState,
  chatId: string,
  messageId: string,
  patch: Partial<Message>,
): Partial<StoreState> {
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
  };
}
