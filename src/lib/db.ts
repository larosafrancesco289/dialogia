import Dexie, { Table } from 'dexie';
import type { Chat, Message, KVRecord } from '@/lib/types';

export class DialogiaDB extends Dexie {
  chats!: Table<Chat, string>;
  messages!: Table<Message, string>;
  kv!: Table<KVRecord, string>;

  constructor() {
    super('dialogia');
    this.version(1).stores({
      chats: 'id, updatedAt, createdAt',
      messages: 'id, chatId, createdAt',
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

export async function getChatWithMessages(chatId: string) {
  const chat = await db.chats.get(chatId);
  const messages = await db.messages.where('chatId').equals(chatId).sortBy('createdAt');
  return { chat, messages } as { chat?: Chat; messages: Message[] };
}

export async function exportAll() {
  const [chats, messages] = await Promise.all([db.chats.toArray(), db.messages.toArray()]);
  return { chats, messages };
}

export async function importAll(data: { chats: Chat[]; messages: Message[] }) {
  await db.transaction('rw', db.chats, db.messages, async () => {
    for (const c of data.chats) await db.chats.put(c);
    for (const m of data.messages) await db.messages.put(m);
  });
}

export async function kvSet<T = any>(key: string, value: T) {
  await db.kv.put({ key, value });
}

export async function kvGet<T = any>(key: string): Promise<T | undefined> {
  const rec = await db.kv.get(key);
  return rec?.value as T | undefined;
}
