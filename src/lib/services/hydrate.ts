// Module: services/hydrate
// Responsibility: Convert repository snapshots into store-ready message indices.

import type { RepositorySnapshot } from '@/lib/db/repository';
import type { Message, MessageTutor } from '@/lib/types';
import { ensureHiddenTutorContent } from '@/lib/services/messagePersistence';

export type HydratedRepositorySnapshot = Omit<RepositorySnapshot, 'messages'> & {
  messagesById: Record<string, Message>;
  messageIdsByChatId: Record<string, string[]>;
  tutorByMessageId: Record<string, MessageTutor>;
};

export const hydrateRepositorySnapshot = (
  snapshot: RepositorySnapshot,
): HydratedRepositorySnapshot => {
  const tutorByMessageId: Record<string, MessageTutor> = {};
  const messagesById: Record<string, Message> = {};
  const messageIdsByChatId: Record<string, string[]> = {};

  for (const [chatId, list] of Object.entries(snapshot.messages)) {
    const ids: string[] = [];
    for (const message of list ?? []) {
      const nextMessage = { ...message } as Message;
      if (nextMessage.role === 'assistant' && nextMessage.tutor) {
        tutorByMessageId[nextMessage.id] = nextMessage.tutor;
      }
      const hydrated = ensureHiddenTutorContent(nextMessage);
      messagesById[hydrated.id] = hydrated;
      ids.push(hydrated.id);
    }
    if (ids.length) messageIdsByChatId[chatId] = ids;
  }

  return {
    ...snapshot,
    messagesById,
    messageIdsByChatId,
    tutorByMessageId,
  };
};
