import { db, saveMessage } from '@/lib/db';
import type { Chat, Folder, Message } from '@/lib/types';
import { buildHiddenTutorContent } from '@/lib/agent/tutorFlow';

type OrderingFn = (a: Message, b: Message) => number;

const compareMessages: OrderingFn = (a, b) => {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  const rolePriority: Record<Message['role'], number> = { system: 0, user: 1, assistant: 2 };
  if (rolePriority[a.role] !== rolePriority[b.role])
    return rolePriority[a.role] - rolePriority[b.role];
  return a.id.localeCompare(b.id);
};

export type RepositorySnapshot = {
  chats: Chat[];
  folders: Folder[];
  messages: Record<string, Message[]>;
  selectedChatId?: string;
  tutorByMessageId: Record<string, any>;
};

export async function loadRepositorySnapshot(
  selectedChatId?: string,
): Promise<RepositorySnapshot> {
  const [chats, folders, messagesArray] = await Promise.all([
    db.chats.toArray(),
    db.folders.toArray(),
    db.messages.toArray(),
  ]);

  const messages: Record<string, Message[]> = {};
  const tutorByMessageId: Record<string, any> = {};
  const updates: Message[] = [];

  for (const m of messagesArray) {
    if (!messages[m.chatId]) messages[m.chatId] = [];
    const nextMessage = { ...m } as Message;
    if (nextMessage.role === 'assistant' && (nextMessage as any).tutor) {
      const tutor = (nextMessage as any).tutor;
      tutorByMessageId[nextMessage.id] = tutor;
      if (!(nextMessage as any).hiddenContent) {
        try {
          const hidden = buildHiddenTutorContent(tutor);
          if (hidden) {
            (nextMessage as any).hiddenContent = hidden;
            updates.push(nextMessage);
          }
        } catch {
          /* ignore tutor content backfill failures */
        }
      }
    }
    messages[m.chatId].push(nextMessage);
  }
  for (const key of Object.keys(messages)) {
    messages[key] = messages[key].slice().sort(compareMessages);
  }

  const resolvedSelected = selectedChatId || chats[0]?.id;
  if (updates.length > 0) {
    for (const msg of updates) {
      void saveMessage(msg).catch(() => undefined);
    }
  }

  return { chats, folders, messages, selectedChatId: resolvedSelected, tutorByMessageId };
}
