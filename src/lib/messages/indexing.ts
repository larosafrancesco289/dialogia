import type { Message } from '@/lib/types';
import { sortMessages } from '@/lib/messages/ordering';

type MessageListCacheEntry = {
  idsRef: string[];
  refs: Array<Message | undefined>;
  list: Message[];
};

const EMPTY_MESSAGES: Message[] = [];
const messageListCache = new Map<string, MessageListCacheEntry>();

export type MessageIndexState = {
  messagesById: Record<string, Message>;
  messageIdsByChatId: Record<string, string[]>;
};

export function buildMessageIndex(messages: Record<string, Message[]>): MessageIndexState {
  const messagesById: Record<string, Message> = {};
  const messageIdsByChatId: Record<string, string[]> = {};
  for (const [chatId, list] of Object.entries(messages)) {
    const ids: string[] = [];
    const sorted = sortMessages(list ?? []);
    for (const message of sorted) {
      messagesById[message.id] = message;
      ids.push(message.id);
    }
    if (ids.length) messageIdsByChatId[chatId] = ids;
  }
  return { messagesById, messageIdsByChatId };
}

export function getMessagesForChat(state: MessageIndexState, chatId: string): Message[] {
  const ids = state.messageIdsByChatId[chatId];
  if (!ids || ids.length === 0) {
    messageListCache.delete(chatId);
    return EMPTY_MESSAGES;
  }

  const cached = messageListCache.get(chatId);
  if (cached && cached.idsRef === ids && cached.refs.length === ids.length) {
    let unchanged = true;
    for (let i = 0; i < ids.length; i += 1) {
      const message = state.messagesById[ids[i]];
      if (message !== cached.refs[i]) {
        unchanged = false;
        break;
      }
    }
    if (unchanged) return cached.list;
  }

  const refs: Array<Message | undefined> = new Array(ids.length);
  const messages: Message[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    const message = state.messagesById[ids[i]];
    refs[i] = message;
    if (message) messages.push(message);
  }
  messageListCache.set(chatId, { idsRef: ids, refs, list: messages });
  return messages;
}

export function setMessagesForChat<S extends MessageIndexState>(
  state: S,
  chatId: string,
  messages: Message[],
): Partial<S> {
  const nextById = { ...state.messagesById };
  const sorted = sortMessages(messages);
  const nextIds = sorted.map((message) => message.id);
  const nextIdSet = new Set(nextIds);
  const previousIds = state.messageIdsByChatId[chatId] ?? [];
  for (const id of previousIds) {
    if (!nextIdSet.has(id)) delete nextById[id];
  }
  for (const message of sorted) {
    nextById[message.id] = message;
  }
  return {
    messagesById: nextById,
    messageIdsByChatId: {
      ...state.messageIdsByChatId,
      [chatId]: nextIds,
    },
  } as Partial<S>;
}

export function appendMessagesToChat<S extends MessageIndexState>(
  state: S,
  chatId: string,
  messages: Message[],
): Partial<S> {
  if (!messages.length) return {};
  const nextById = { ...state.messagesById };
  const existing = getMessagesForChat(state, chatId);
  const combined = [...existing, ...messages];
  const deduped = new Map<string, Message>();
  for (const message of combined) {
    deduped.set(message.id, message);
  }
  const sorted = sortMessages(Array.from(deduped.values()));
  const nextIds = sorted.map((message) => message.id);
  for (const message of sorted) {
    nextById[message.id] = message;
  }
  return {
    messagesById: nextById,
    messageIdsByChatId: {
      ...state.messageIdsByChatId,
      [chatId]: nextIds,
    },
  } as Partial<S>;
}

export function removeChatMessages<S extends MessageIndexState>(
  state: S,
  chatId: string,
): Partial<S> {
  const nextById = { ...state.messagesById };
  const nextIdsByChat = { ...state.messageIdsByChatId };
  const ids = nextIdsByChat[chatId] ?? [];
  for (const id of ids) delete nextById[id];
  delete nextIdsByChat[chatId];
  return {
    messagesById: nextById,
    messageIdsByChatId: nextIdsByChat,
  } as Partial<S>;
}
