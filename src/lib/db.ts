import Dexie, { Table } from 'dexie';
import type { Chat, Message, KVRecord, Folder } from '@/lib/types';

export class DialogiaDB extends Dexie {
  chats!: Table<Chat, string>;
  messages!: Table<Message, string>;
  folders!: Table<Folder, string>;
  kv!: Table<KVRecord, string>;

  constructor() {
    super('dialogia');
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
