import Dexie, { Table } from 'dexie';
import type { Chat, Message, KVRecord, Folder } from '@/lib/types';
import { sanitizeMessageRecord } from '@/lib/db/sanitize';
import { DB_SCHEMA_VERSION } from '@/lib/db/versions';

export { sanitizeMessageRecord } from '@/lib/db/sanitize';

function cloneValue<T>(value: T): T {
  try {
    const g = globalThis as { structuredClone?: <U>(input: U) => U };
    if (g && typeof g.structuredClone === 'function') {
      return g.structuredClone(value);
    }
  } catch {
    // fall through to JSON fallback
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

class InMemoryCollection<T> {
  constructor(
    private readonly table: InMemoryTable<T>,
    private readonly predicate: (value: T) => boolean,
  ) {}

  private collect(): T[] {
    return this.table
      .entries()
      .filter(([, value]) => this.predicate(value))
      .map(([, value]) => cloneValue(value));
  }

  async toArray(): Promise<T[]> {
    return this.collect();
  }

  async sortBy<K extends keyof T>(field: K): Promise<T[]> {
    return this.collect().sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv);
      return 0;
    });
  }

  async delete(): Promise<number> {
    return this.table.deleteWhere(this.predicate);
  }
}

class InMemoryTable<T> {
  private data = new Map<string, T>();

  constructor(private readonly keyOf: (value: T) => string) {}

  async put(value: T) {
    this.data.set(this.keyOf(value), cloneValue(value));
  }

  async delete(id: string): Promise<void> {
    this.data.delete(id);
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.data.values()).map((entry) => cloneValue(entry));
  }

  async get(id: string): Promise<T | undefined> {
    const found = this.data.get(id);
    return found ? cloneValue(found) : undefined;
  }

  entries(): [string, T][] {
    return Array.from(this.data.entries());
  }

  deleteWhere(predicate: (value: T) => boolean): number {
    let count = 0;
    for (const [key, value] of this.data.entries()) {
      if (predicate(value)) {
        this.data.delete(key);
        count += 1;
      }
    }
    return count;
  }

  where<K extends keyof T>(field: K): {
    equals(value: T[K]): InMemoryCollection<T>;
  };
  where(query: Partial<T>): InMemoryCollection<T>;
  where(fieldOrQuery: keyof T | Partial<T>): any {
    if (typeof fieldOrQuery === 'string') {
      const field = fieldOrQuery as keyof T;
      return {
        equals: (value: T[keyof T]) =>
          new InMemoryCollection<T>(this, (entry) => entry[field] === value),
      } as { equals(value: T[keyof T]): InMemoryCollection<T> };
    }
    const query = fieldOrQuery as Partial<T>;
    const keys = Object.keys(query ?? {}) as (keyof T)[];
    return new InMemoryCollection<T>(
      this,
      (entry) => keys.every((key) => entry[key] === query[key]),
    );
  }
}

class InMemoryDialogiaDB {
  chats = new InMemoryTable<Chat>((chat) => chat.id);
  messages = new InMemoryTable<Message>((message) => message.id);
  folders = new InMemoryTable<Folder>((folder) => folder.id);
  kv = new InMemoryTable<KVRecord>((record) => record.key);

  async transaction(_mode: 'r' | 'rw', ...args: any[]) {
    const callback = args.pop();
    if (typeof callback === 'function') {
      await callback({
        table: <U>(name: string) => {
          const mapping: Record<string, InMemoryTable<any>> = {
            chats: this.chats,
            messages: this.messages,
            folders: this.folders,
            kv: this.kv,
          };
          return mapping[name] as InMemoryTable<U>;
        },
      });
    }
  }
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

const hasIndexedDb =
  typeof globalThis !== 'undefined' && (globalThis as any)?.indexedDB != null;

export const db: DialogiaDB | InMemoryDialogiaDB = hasIndexedDb
  ? new DialogiaDB()
  : new InMemoryDialogiaDB();

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
  let messages: Message[];
  const messagesTable = db.messages as any;
  if (messagesTable && typeof messagesTable.where === 'function') {
    const clause = messagesTable.where('chatId');
    if (clause && typeof clause.equals === 'function') {
      messages = await clause.equals(chatId).sortBy('createdAt');
    } else {
      messages = (await db.messages.toArray())
        .filter((entry) => entry.chatId === chatId)
        .sort((a, b) => a.createdAt - b.createdAt);
    }
  } else {
    messages = (await db.messages.toArray())
      .filter((entry) => entry.chatId === chatId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }
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
