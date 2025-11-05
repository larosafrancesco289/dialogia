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
  const nextList = list.map((message) =>
    message.id === messageId ? ({ ...message, ...patch } as Message) : message,
  );
  return {
    messages: {
      ...state.messages,
      [chatId]: nextList,
    },
  };
}
