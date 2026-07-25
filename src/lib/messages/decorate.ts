// Module: messages/decorate
// Responsibility: Let modules derive fields on a message before it is stored or
// hydrated. Core knows the hook, not what any module does with it.

import type { Message } from '@/lib/types';
import { ENABLED_MODULES } from '@/lib/modules';

export function decorateMessage(message: Message): Message {
  let next = message;
  for (const appModule of ENABLED_MODULES) {
    if (!appModule.decorateMessage) continue;
    try {
      next = appModule.decorateMessage(next);
    } catch {
      // A module failing to decorate must never block persistence.
    }
  }
  return next;
}
