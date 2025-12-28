import type { RepositorySnapshot } from '@/lib/db/repository';
import type { Message, MessageTutor } from '@/lib/types';
import { ensureHiddenTutorContent } from '@/lib/services/messagePersistence';

export type HydratedRepositorySnapshot = RepositorySnapshot & {
  tutorByMessageId: Record<string, MessageTutor>;
};

export const hydrateRepositorySnapshot = (
  snapshot: RepositorySnapshot,
): HydratedRepositorySnapshot => {
  const tutorByMessageId: Record<string, MessageTutor> = {};
  const messages: Record<string, Message[]> = {};

  for (const [chatId, list] of Object.entries(snapshot.messages)) {
    messages[chatId] = (list ?? []).map((message) => {
      const nextMessage = { ...message } as Message;
      if (nextMessage.role === 'assistant' && nextMessage.tutor) {
        tutorByMessageId[nextMessage.id] = nextMessage.tutor;
        return ensureHiddenTutorContent(nextMessage);
      }
      return nextMessage;
    });
  }

  return {
    ...snapshot,
    messages,
    tutorByMessageId,
  };
};
