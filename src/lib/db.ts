import Dexie, { Table } from 'dexie';
import type { Chat, Message, KVRecord, Folder } from '@/lib/types';

export function sanitizeMessageRecord(message: Message): { next: Message; changed: boolean } {
  const next: Message = { ...message };
  let changed = false;

  if (typeof next.hiddenContent === 'string') {
    const trimmed = next.hiddenContent.trim();
    if (trimmed !== next.hiddenContent) changed = true;
    if (trimmed) next.hiddenContent = trimmed;
    else {
      delete next.hiddenContent;
      changed = true;
    }
  }

  if (!Array.isArray(next.attachments) || next.attachments.length === 0) {
    if (next.attachments) {
      delete next.attachments;
      changed = true;
    }
  } else {
    const filtered = next.attachments.filter(Boolean);
    if (filtered.length !== next.attachments.length) {
      next.attachments = filtered;
      changed = true;
    }
    if (filtered.length === 0) {
      delete next.attachments;
      changed = true;
    }
  }

  if (next.tutor && typeof next.tutor === 'object') {
    const keys = Object.keys(next.tutor).filter((key) => {
      const value = (next.tutor as any)[key];
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === 'object') return Object.keys(value).length > 0;
      return value != null;
    });
    if (keys.length === 0) {
      delete next.tutor;
      changed = true;
    }
  }

  if (next.tutorWelcome === false) {
    delete next.tutorWelcome;
    changed = true;
  }

  return { next, changed };
}

export class DialogiaDB extends Dexie {
  chats!: Table<Chat, string>;
  messages!: Table<Message, string>;
  folders!: Table<Folder, string>;
  kv!: Table<KVRecord, string>;

  constructor(name = 'dialogia') {
    super(name);
    this.version(1).stores({
      chats: 'id, updatedAt, createdAt',
      messages: 'id, chatId, createdAt',
      kv: 'key',
    });
    this.version(2).stores({
      chats: 'id, updatedAt, createdAt, folderId',
      messages: 'id, chatId, createdAt',
      folders: 'id, updatedAt, createdAt, parentId',
      kv: 'key',
    });
    this.version(3)
      .stores({
        chats: 'id, updatedAt, createdAt, folderId',
        messages: 'id, chatId, createdAt',
        folders: 'id, updatedAt, createdAt, parentId',
        kv: 'key',
      })
      .upgrade(async (tx) => {
        const messagesTable = tx.table<Message>('messages');
        const allMessages = await messagesTable.toArray();
        for (const record of allMessages) {
          const { next: sanitized, changed } = sanitizeMessageRecord(record);
          if (changed) {
            await messagesTable.put(sanitized);
          }
        }
      });
  }
}

export const db = new DialogiaDB();

export async function saveChat(chat: Chat) {
  await db.chats.put(chat);
}

export async function saveMessage(message: Message) {
  await db.messages.put(message);
}

export async function saveFolder(folder: Folder) {
  await db.folders.put(folder);
}

export async function getChatWithMessages(chatId: string) {
  const chat = await db.chats.get(chatId);
  const messages = await db.messages.where('chatId').equals(chatId).sortBy('createdAt');
  return { chat, messages } as { chat?: Chat; messages: Message[] };
}

export async function exportAll() {
  const [chats, messages, folders] = await Promise.all([
    db.chats.toArray(),
    db.messages.toArray(),
    db.folders.toArray(),
  ]);
  return { chats, messages, folders };
}

export async function importAll(data: { chats: Chat[]; messages: Message[]; folders?: Folder[] }) {
  await db.transaction('rw', db.chats, db.messages, db.folders, async () => {
    for (const c of data.chats) await db.chats.put(c);
    for (const m of data.messages) await db.messages.put(m);
    for (const f of data.folders || []) await db.folders.put(f);
  });
}

export async function kvSet<T = any>(key: string, value: T) {
  await db.kv.put({ key, value });
}

export async function kvGet<T = any>(key: string): Promise<T | undefined> {
  const rec = await db.kv.get(key);
  return rec?.value as T | undefined;
}
