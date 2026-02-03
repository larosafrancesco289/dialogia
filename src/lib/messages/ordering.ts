import type { Message } from '@/lib/types';

export type MessageOrderingFn = (a: Message, b: Message) => number;

export const compareMessages: MessageOrderingFn = (a, b) => {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  const rolePriority: Record<Message['role'], number> = { system: 0, user: 1, assistant: 2 };
  if (rolePriority[a.role] !== rolePriority[b.role])
    return rolePriority[a.role] - rolePriority[b.role];
  return a.id.localeCompare(b.id);
};

export function sortMessages(messages: Message[]): Message[] {
  return messages.slice().sort(compareMessages);
}
