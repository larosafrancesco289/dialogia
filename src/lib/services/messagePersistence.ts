import type { Repository } from '@/lib/db/repository';
import type { Message } from '@/lib/types';
import { buildHiddenTutorContent } from '@/lib/tutor/hiddenContent';

export const ensureHiddenTutorContent = (message: Message): Message => {
  if (!message?.tutor) return message;
  try {
    const hidden = buildHiddenTutorContent(message.tutor);
    if (!hidden) return message;
    return { ...message, hiddenContent: hidden };
  } catch {
    return message;
  }
};

export const createMessagePersister = (repository: Repository) => {
  return async (message: Message) => {
    await repository.saveMessage(ensureHiddenTutorContent(message));
  };
};

export const persistMessages = async (repository: Repository, messages: Message[]) => {
  if (!messages.length) return;
  const sanitized = messages.map((message) => ensureHiddenTutorContent(message));
  await repository.saveMessages(sanitized);
};
