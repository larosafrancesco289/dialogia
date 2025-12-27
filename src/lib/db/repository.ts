import type { Chat, Folder, Message, MessageTutor } from '@/lib/types';
import { sanitizeMessageRecord } from '@/lib/db/sanitize';
import { buildHiddenTutorContent } from '@/lib/tutor/hiddenContent';

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
};

export type DialogiaDbLike = {
  chats: DbTable<Chat>;
  messages: DbTable<Message>;
  folders: DbTable<Folder>;
};

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
  tutorByMessageId: Record<string, MessageTutor>;
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
    if (collection.sortBy) return collection.sortBy('createdAt');
    if (collection.toArray) {
      const list = await collection.toArray();
      return list.slice().sort(compareMessages);
    }
  }
  return (await db.messages.toArray())
    .filter((entry) => entry.chatId === chatId)
    .sort(compareMessages);
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
    return { chats, messages, folders };
  };

  const importAll = async (data: { chats: Chat[]; messages: Message[]; folders?: Folder[] }) => {
    await runTransaction(db, [db.chats, db.messages, db.folders], async () => {
      for (const c of data.chats) await db.chats.put(c);
      for (const m of data.messages) await db.messages.put(m);
      for (const f of data.folders || []) await db.folders.put(f);
    });
  };

  const loadRepositorySnapshot = async (selectedChatId?: string): Promise<RepositorySnapshot> => {
    const [chats, folders, messagesArray] = await Promise.all([
      db.chats.toArray(),
      db.folders.toArray(),
      db.messages.toArray(),
    ]);

    const messages: Record<string, Message[]> = {};
    const tutorByMessageId: Record<string, MessageTutor> = {};
    for (const m of messagesArray) {
      if (!messages[m.chatId]) messages[m.chatId] = [];
      const nextMessage = { ...m } as Message;
      if (nextMessage.role === 'assistant' && nextMessage.tutor) {
        tutorByMessageId[nextMessage.id] = nextMessage.tutor;
        if (!nextMessage.hiddenContent) {
          try {
            const hidden = buildHiddenTutorContent(nextMessage.tutor);
            if (hidden) {
              nextMessage.hiddenContent = hidden;
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
    return { chats, folders, messages, selectedChatId: resolvedSelected, tutorByMessageId };
  };

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
    saveFolder,
    getChatWithMessages,
    exportAll,
    importAll,
    loadRepositorySnapshot,
    saveChatWithMessages,
    deleteChatAndMessages,
    deleteFolder,
  };
}
