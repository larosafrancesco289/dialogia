// Module: services/hydrate
// Responsibility: Convert repository snapshots into store-ready message indices.

import type { RepositorySnapshot } from '@/lib/db/repository';
import type { Message } from '@/lib/types';
import { decorateMessage } from '@/lib/messages/decorate';

export type HydratedRepositorySnapshot = Omit<RepositorySnapshot, 'messages'> & {
  messagesById: Record<string, Message>;
  messageIdsByChatId: Record<string, string[]>;
};

/** Hydrate a single chat's persisted messages (used by lazy chat loads). */
export const hydrateMessageList = (list: Message[]): Message[] =>
  (list ?? []).map((message) => decorateMessage({ ...message }));

export const hydrateRepositorySnapshot = (
  snapshot: RepositorySnapshot,
): HydratedRepositorySnapshot => {
  const messagesById: Record<string, Message> = {};
  const messageIdsByChatId: Record<string, string[]> = {};

  for (const [chatId, list] of Object.entries(snapshot.messages)) {
    const ids: string[] = [];
    for (const message of hydrateMessageList(list ?? [])) {
      messagesById[message.id] = message;
      ids.push(message.id);
    }
    if (ids.length) messageIdsByChatId[chatId] = ids;
  }

  return { ...snapshot, messagesById, messageIdsByChatId };
};
