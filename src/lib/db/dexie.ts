import Dexie, { Table } from 'dexie';
import type { Chat, Folder, KVRecord, Message } from '@/lib/types';
import { sanitizeMessageRecord } from '@/lib/db/sanitize';
import { DB_SCHEMA_VERSION } from '@/lib/db/versions';

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
    this.version(DB_SCHEMA_VERSION)
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

export function createDexieDb(name?: string) {
  return new DialogiaDB(name);
}
