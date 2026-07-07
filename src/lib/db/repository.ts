import type { Chat, Folder, Message } from '@/lib/types';
import { sanitizeMessageRecord } from '@/lib/db/sanitize';
import { sortMessages } from '@/lib/messages/ordering';
import { normalizeChatSettings } from '@/lib/settings/normalize';
import { migrateGenSettingsRecord } from '@/lib/settings/migrations';
import { ChatSchema, MessageSchema } from '@/lib/schemas/persisted';
import { DEFAULT_MODEL_ID, DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { resolveDynamicModelId } from '@/lib/models/dynamicDefaults';
import { isRecord } from '@/lib/utils/guards';

type DbCollection<T> = {
  toArray?: () => Promise<T[]>;
  sortBy?: <K extends keyof T>(field: K) => Promise<T[]>;
  delete?: () => PromiseLike<number | void>;
};

type DbWhereClause<T> = {
  equals: (value: string | number) => DbCollection<T>;
};

type DbWhere<T> = {
  (index: string | string[]): DbWhereClause<T>;
  (criteria: Record<string, unknown>): DbCollection<T>;
};

type DbTable<T> = {
  put: (value: T) => PromiseLike<unknown>;
  delete: (id: string) => PromiseLike<unknown>;
  get: (id: string) => Promise<T | undefined>;
  toArray: () => Promise<T[]>;
  where?: DbWhere<T>;
  orderBy?: (index: string) => { uniqueKeys?: () => Promise<unknown[]> };
};

export type DialogiaDbLike = {
  chats: DbTable<Chat>;
  messages: DbTable<Message>;
  folders: DbTable<Folder>;
};

export type RepositorySnapshot = {
  chats: Chat[];
  folders: Folder[];
  /** Messages for the selected chat only; other chats load lazily. */
  messages: Record<string, Message[]>;
  /** Chat ids that have at least one persisted message. */
  chatIdsWithMessages: string[];
  selectedChatId?: string;
};

function pickMessageCollection(
  table: DbTable<Message>,
  chatId: string,
): DbCollection<Message> | null {
  if (!table.where) return null;
  try {
    const byField = table.where('chatId') as DbWhereClause<Message> | undefined;
    if (byField && typeof byField.equals === 'function') {
      return byField.equals(chatId);
    }
  } catch {
    // ignore and fall back to object query
  }
  try {
    return (table.where({ chatId }) as DbCollection<Message>) ?? null;
  } catch {
    return null;
  }
}

async function getMessagesForChat(db: DialogiaDbLike, chatId: string): Promise<Message[]> {
  const collection = pickMessageCollection(db.messages, chatId);
  if (collection) {
    if (collection.sortBy) return sortMessages(await collection.sortBy('createdAt'));
    if (collection.toArray) {
      const list = await collection.toArray();
      return sortMessages(list);
    }
  }
  const list = (await db.messages.toArray()).filter((entry) => entry.chatId === chatId);
  return sortMessages(list);
}

async function deleteMessagesForChat(db: DialogiaDbLike, chatId: string): Promise<void> {
  const collection = pickMessageCollection(db.messages, chatId);
  if (collection?.delete) {
    await collection.delete();
    return;
  }
  const all = await db.messages.toArray();
  await Promise.all(
    all.filter((msg) => msg.chatId === chatId).map((msg) => db.messages.delete(msg.id)),
  );
}

type TransactionTable = DbTable<Chat> | DbTable<Message> | DbTable<Folder>;
type DbTransaction = (mode: 'r' | 'rw', ...args: unknown[]) => PromiseLike<unknown>;

async function runTransaction(
  db: DialogiaDbLike,
  tables: TransactionTable[],
  fn: () => Promise<void>,
): Promise<void> {
  const transaction = (db as { transaction?: DbTransaction }).transaction;
  if (typeof transaction === 'function') {
    await transaction.call(db, 'rw', ...tables, fn);
    return;
  }
  await fn();
}

export function createRepository(db: DialogiaDbLike) {
  const saveChat = async (chat: Chat) => {
    await db.chats.put(chat);
  };

  const saveMessage = async (message: Message) => {
    const { next } = sanitizeMessageRecord(message);
    await db.messages.put(next);
  };

  const saveMessages = async (messages: Message[]) => {
    if (!messages.length) return;
    await runTransaction(db, [db.messages], async () => {
      for (const message of messages) {
        await saveMessage(message);
      }
    });
  };

  const saveFolder = async (folder: Folder) => {
    await db.folders.put(folder);
  };

  const getChatWithMessages = async (chatId: string) => {
    const chat = await db.chats.get(chatId);
    const messages = await getMessagesForChat(db, chatId);
    return { chat, messages } as { chat?: Chat; messages: Message[] };
  };

  const exportAll = async () => {
    const [chats, messages, folders] = await Promise.all([
      db.chats.toArray(),
      db.messages.toArray(),
      db.folders.toArray(),
    ]);
    return { chats, messages: sortMessages(messages), folders };
  };

  const importAll = async (data: { chats?: unknown; messages?: unknown; folders?: unknown }) => {
    const rawChats = Array.isArray(data?.chats) ? data.chats : [];
    const rawMessages = Array.isArray(data?.messages) ? data.messages : [];
    const rawFolders = Array.isArray(data?.folders) ? data.folders : [];

    const chats: Chat[] = [];
    const chatIds = new Set<string>();
    for (const entry of rawChats) {
      if (!isRecord(entry)) continue;
      const settings = normalizeChatSettings(entry.settings, {
        fallbackModelId: resolveDynamicModelId(DEFAULT_MODEL_ID, []),
        fallbackTutorModelId: resolveDynamicModelId(DEFAULT_TUTOR_MODEL_ID, []),
      });
      const candidate = { ...entry, settings };
      const parsed = ChatSchema.safeParse(candidate);
      if (!parsed.success) continue;
      chats.push(parsed.data);
      chatIds.add(parsed.data.id);
    }

    const messages: Message[] = [];
    for (const entry of rawMessages) {
      if (!isRecord(entry)) continue;
      const nextRecord: Record<string, unknown> = { ...entry };
      if ('genSettings' in nextRecord) {
        const { next } = migrateGenSettingsRecord(nextRecord.genSettings);
        nextRecord.genSettings = next;
      }
      const parsed = MessageSchema.safeParse(nextRecord);
      if (!parsed.success) continue;
      if (!chatIds.has(parsed.data.chatId)) continue;
      const sanitized = sanitizeMessageRecord(parsed.data).next;
      messages.push(sanitized);
    }

    const folders: Folder[] = rawFolders.filter((entry): entry is Folder => {
      if (!isRecord(entry)) return false;
      if (typeof entry.id !== 'string' || typeof entry.name !== 'string') return false;
      return typeof entry.createdAt === 'number' && typeof entry.updatedAt === 'number';
    });

    await runTransaction(db, [db.chats, db.messages, db.folders], async () => {
      for (const c of chats) await db.chats.put(c);
      for (const m of messages) await db.messages.put(m);
      for (const f of folders) await db.folders.put(f);
    });
  };

  const listChatIdsWithMessages = async (): Promise<string[]> => {
    if (typeof db.messages.orderBy === 'function') {
      try {
        const keys = await db.messages.orderBy('chatId').uniqueKeys?.();
        if (keys) return keys.map((key) => String(key));
      } catch {
        // fall through to the full scan below
      }
    }
    const all = await db.messages.toArray();
    return Array.from(new Set(all.map((message) => message.chatId)));
  };

  // Load chats/folders plus messages for the selected chat only. Loading the
  // whole messages table up front made startup cost scale with total history
  // (including image attachments stored as data URLs).
  const loadRepositorySnapshot = async (selectedChatId?: string): Promise<RepositorySnapshot> => {
    const [chats, folders, chatIdsWithMessages] = await Promise.all([
      db.chats.toArray(),
      db.folders.toArray(),
      listChatIdsWithMessages(),
    ]);

    const resolvedSelected = selectedChatId || chats[0]?.id;
    const messages: Record<string, Message[]> = {};
    if (resolvedSelected && chatIdsWithMessages.includes(resolvedSelected)) {
      messages[resolvedSelected] = await getMessagesForChat(db, resolvedSelected);
    }

    return { chats, folders, messages, chatIdsWithMessages, selectedChatId: resolvedSelected };
  };

  const loadMessagesForChat = async (chatId: string): Promise<Message[]> =>
    getMessagesForChat(db, chatId);

  const saveChatWithMessages = async (chat: Chat, list: Message[]) => {
    await runTransaction(db, [db.chats, db.messages], async () => {
      await saveChat(chat);
      for (const message of list) await saveMessage(message);
    });
  };

  const deleteChatAndMessages = async (chatId: string) => {
    await runTransaction(db, [db.chats, db.messages], async () => {
      await db.chats.delete(chatId);
      await deleteMessagesForChat(db, chatId);
    });
  };

  const deleteFolder = async (folderId: string) => {
    await db.folders.delete(folderId);
  };

  return {
    saveChat,
    saveMessage,
    saveMessages,
    saveFolder,
    getChatWithMessages,
    exportAll,
    importAll,
    loadRepositorySnapshot,
    loadMessagesForChat,
    saveChatWithMessages,
    deleteChatAndMessages,
    deleteFolder,
  };
}

export type Repository = ReturnType<typeof createRepository>;
