import type { Repository } from '@/lib/db/repository';
import type { Message } from '@/lib/types';
import { createMessagePersister } from '@/lib/services/messagePersistence';

const TUTOR_PERSIST_DEBOUNCE_MS = 500;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingMessages = new Map<string, Message>();

export function scheduleTutorPersistence(args: {
  message: Message;
  repository: Repository;
  delayMs?: number;
}) {
  const { message, repository, delayMs } = args;
  pendingMessages.set(message.id, message);
  const existing = pendingTimers.get(message.id);
  if (existing) clearTimeout(existing);

  const persistMessage = createMessagePersister(repository);
  const timer = setTimeout(async () => {
    pendingTimers.delete(message.id);
    const latest = pendingMessages.get(message.id);
    if (!latest) return;
    pendingMessages.delete(message.id);
    try {
      await persistMessage(latest);
    } catch {
      /* noop */
    }
  }, delayMs ?? TUTOR_PERSIST_DEBOUNCE_MS);

  pendingTimers.set(message.id, timer);
}
