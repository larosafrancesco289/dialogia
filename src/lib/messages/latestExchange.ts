// Module: messages/latestExchange
// Responsibility: which messages belong to a chat's latest exchange, for chats whose
// replies may only be redone there (see `AppModule.latestExchangeOnly`).

import type { Message } from '@/lib/types';

/**
 * Whether the message belongs to the chat's latest exchange: no user message
 * comes after it. That is the last user message and every reply to it (one
 * per model in a multi-model turn).
 */
export function inLatestExchange(messages: readonly Message[], messageId: string): boolean {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return false;
  return !messages.slice(index + 1).some((message) => message.role === 'user');
}
