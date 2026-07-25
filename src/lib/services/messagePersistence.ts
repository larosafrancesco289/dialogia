// Module: services/messagePersistence
// Responsibility: Persist message updates with minimal side effects.

import type { Repository } from '@/lib/db/repository';
import type { Message } from '@/lib/types';
import { decorateMessage } from '@/lib/messages/decorate';

export const createMessagePersister = (repository: Repository) => {
  return async (message: Message) => {
    await repository.saveMessage(decorateMessage(message));
  };
};

export const persistMessages = async (repository: Repository, messages: Message[]) => {
  if (!messages.length) return;
  const sanitized = messages.map((message) => decorateMessage(message));
  await repository.saveMessages(sanitized);
};
