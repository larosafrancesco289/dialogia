import Dexie, { Table } from 'dexie';
import type { Chat, Folder, KVRecord, Message } from '@/lib/types';
import { sanitizeMessageRecord } from '@/lib/db/sanitize';
import { DB_SCHEMA_VERSION } from '@/lib/db/versions';
import { migrateGenSettingsRecord } from '@/lib/settings/migrations';
import { normalizeChatSettings } from '@/lib/settings/normalize';
import { DEFAULT_MODEL_ID, DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';

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
        const chatsTable = tx.table<Chat>('chats');
        const messagesTable = tx.table<Message>('messages');

        const allChats = await chatsTable.toArray();
        for (const record of allChats) {
          const settings = normalizeChatSettings(record.settings, {
            fallbackModelId: DEFAULT_MODEL_ID,
            fallbackTutorModelId: DEFAULT_TUTOR_MODEL_ID,
          });
          const changed = JSON.stringify(settings) !== JSON.stringify(record.settings);
          if (changed) await chatsTable.put({ ...record, settings });
        }

        const allMessages = await messagesTable.toArray();
        for (const record of allMessages) {
          let nextRecord: Record<string, unknown> = record;
          let changed = false;

          const sanitized = sanitizeMessageRecord(record);
          if (sanitized.changed) {
            changed = true;
            nextRecord = sanitized.next as Record<string, unknown>;
          }

          if ('genSettings' in nextRecord) {
            const { next: genSettings, changed: genChanged } = migrateGenSettingsRecord(
              nextRecord.genSettings,
            );
            if (genChanged) {
              changed = true;
              nextRecord = { ...nextRecord, genSettings };
            }
          }

          if ('settings' in nextRecord) {
            const settings = normalizeChatSettings(nextRecord.settings, {
              fallbackModelId: DEFAULT_MODEL_ID,
              fallbackTutorModelId: DEFAULT_TUTOR_MODEL_ID,
            });
            if (JSON.stringify(settings) !== JSON.stringify(nextRecord.settings)) {
              changed = true;
              nextRecord = { ...nextRecord, settings };
            }
          }

          if (changed) {
            await messagesTable.put(nextRecord as Message);
          }
        }
      });
  }
}

export function createDexieDb(name?: string) {
  return new DialogiaDB(name);
}
