import type { Chat, Folder, Message, TutorEventRecord } from '@/lib/types';
import { sanitizeMessageRecord, sanitizeTutorEventRecord } from '@/lib/db/sanitize';
import { sortMessages } from '@/lib/messages/ordering';
import { normalizeChatSettings } from '@/lib/settings/normalize';
import { migrateGenSettingsRecord } from '@/lib/settings/migrations';
import { ChatSchema, MessageSchema } from '@/lib/schemas/persisted';
import { DEFAULT_MODEL_ID, DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { resolveDynamicModelId } from '@/lib/models/dynamicDefaults';
import { isRecord } from '@/lib/utils/guards';
import { upgradeLegacyBaseSystem } from '@/lib/settings/baseSystem';

// Chats store their prompt text, so one still wearing an old built-in default
// picks up the current one on load; the next save writes it back.
const upgradeChatSystem = (chat: Chat): Chat => {
  const system = upgradeLegacyBaseSystem(chat.settings?.system);
  return system === chat.settings?.system
    ? chat
    : { ...chat, settings: { ...chat.settings, system } };
};

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
  tutorEvents: DbTable<TutorEventRecord>;
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

function pickChatCollection<T extends { chatId: string }>(
  table: DbTable<T>,
  chatId: string,
): DbCollection<T> | null {
  if (!table.where) return null;
  try {
    const byField = table.where('chatId') as DbWhereClause<T> | undefined;
    if (byField && typeof byField.equals === 'function') {
      return byField.equals(chatId);
    }
  } catch {
    // ignore and fall back to object query
  }
  try {
    return (table.where({ chatId }) as DbCollection<T>) ?? null;
  } catch {
    return null;
  }
}

async function getMessagesForChat(db: DialogiaDbLike, chatId: string): Promise<Message[]> {
  const collection = pickChatCollection(db.messages, chatId);
  let list: Message[] | undefined;
  if (collection) {
    if (collection.sortBy) list = await collection.sortBy('createdAt');
    else if (collection.toArray) list = await collection.toArray();
  }
  if (!list) list = (await db.messages.toArray()).filter((entry) => entry.chatId === chatId);
  // Reads sanitize like saves do, so legacy rows (e.g. a deep-research answer
  // folded into content) render correctly before their next rewrite.
  return sortMessages(list).map((message) => sanitizeMessageRecord(message).next);
}

async function deleteMessagesForChat(db: DialogiaDbLike, chatId: string): Promise<void> {
  const collection = pickChatCollection(db.messages, chatId);
  if (collection?.delete) {
    await collection.delete();
    return;
  }
  const all = await db.messages.toArray();
  await Promise.all(
    all.filter((msg) => msg.chatId === chatId).map((msg) => db.messages.delete(msg.id)),
  );
}

async function getTutorEventsForChat(
  db: DialogiaDbLike,
  chatId: string,
): Promise<TutorEventRecord[]> {
  const collection = pickChatCollection(db.tutorEvents, chatId);
  let list: TutorEventRecord[] | undefined;
  if (collection?.toArray) list = await collection.toArray();
  if (!list) list = (await db.tutorEvents.toArray()).filter((entry) => entry.chatId === chatId);
  return list
    .map(sanitizeTutorEventRecord)
    .filter((entry): entry is TutorEventRecord => !!entry && entry.chatId === chatId)
    .sort((a, b) => a.seq - b.seq);
}

async function deleteTutorEventsForChat(db: DialogiaDbLike, chatId: string): Promise<void> {
  const collection = pickChatCollection(db.tutorEvents, chatId);
  if (collection?.delete) {
    await collection.delete();
    return;
  }
  const all = await db.tutorEvents.toArray();
  await Promise.all(
    all.filter((event) => event.chatId === chatId).map((event) => db.tutorEvents.delete(event.id)),
  );
}

/**
 * An append met a row at one of its positions that is not the same event:
 * another tab wrote to the chat's log first. Nothing of the append was
 * written; the caller should reload the log and decide again.
 */
export class TutorLogConflictError extends Error {
  constructor(chatId: string, seq: number) {
    super(`Tutor log position ${seq} of chat ${chatId} is already taken`);
    this.name = 'TutorLogConflictError';
  }
}

function isConstraintError(error: unknown): boolean {
  const named = (value: unknown) =>
    !!value &&
    typeof value === 'object' &&
    (value as { name?: unknown }).name === 'ConstraintError';
  return named(error) || named((error as { inner?: unknown } | undefined)?.inner);
}

/** The row at a chat's log position, if any. */
async function tutorEventAt(
  db: DialogiaDbLike,
  chatId: string,
  seq: number,
): Promise<TutorEventRecord | undefined> {
  const collection = db.tutorEvents.where?.({ chatId, seq });
  if (collection?.toArray) return (await collection.toArray())[0];
  return (await db.tutorEvents.toArray()).find(
    (entry) => entry.chatId === chatId && entry.seq === seq,
  );
}

type TransactionTable =
  | DbTable<Chat>
  | DbTable<Message>
  | DbTable<Folder>
  | DbTable<TutorEventRecord>;
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
    const stored = await db.chats.get(chatId);
    const chat = stored && upgradeChatSystem(stored);
    const messages = await getMessagesForChat(db, chatId);
    return { chat, messages } as { chat?: Chat; messages: Message[] };
  };

  const exportAll = async () => {
    const [chats, messages, folders, tutorEvents] = await Promise.all([
      db.chats.toArray(),
      db.messages.toArray(),
      db.folders.toArray(),
      db.tutorEvents.toArray(),
    ]);
    // A log whose chat is gone (a write that raced its deletion) is not exported.
    const chatIds = new Set(chats.map((chat) => chat.id));
    return {
      chats,
      messages: sortMessages(messages),
      folders,
      tutorEvents: tutorEvents
        .filter((event) => chatIds.has(event.chatId))
        .sort((a, b) => (a.chatId === b.chatId ? a.seq - b.seq : a.chatId.localeCompare(b.chatId))),
    };
  };

  const importAll = async (data: {
    chats?: unknown;
    messages?: unknown;
    folders?: unknown;
    tutorEvents?: unknown;
  }) => {
    const rawChats = Array.isArray(data?.chats) ? data.chats : [];
    const rawMessages = Array.isArray(data?.messages) ? data.messages : [];
    const rawFolders = Array.isArray(data?.folders) ? data.folders : [];
    // Exports from before the tutor's event log have no `tutorEvents`.
    const rawTutorEvents = Array.isArray(data?.tutorEvents) ? data.tutorEvents : [];

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

    const tutorEvents: TutorEventRecord[] = [];
    const seenEventIds = new Set<string>();
    // A position holds one event; a backup with two at one keeps the first.
    const seenPositions = new Set<string>();
    for (const entry of rawTutorEvents) {
      const event = sanitizeTutorEventRecord(entry);
      if (!event || !chatIds.has(event.chatId) || seenEventIds.has(event.id)) continue;
      const position = `${event.chatId}\u0000${event.seq}`;
      if (seenPositions.has(position)) continue;
      seenEventIds.add(event.id);
      seenPositions.add(position);
      tutorEvents.push(event);
    }
    // A chat's log is one sequence: an imported log replaces the local one
    // rather than interleaving two sets of positions.
    const chatsWithEvents = new Set(tutorEvents.map((event) => event.chatId));

    await runTransaction(db, [db.chats, db.messages, db.folders, db.tutorEvents], async () => {
      for (const c of chats) await db.chats.put(c);
      for (const m of messages) await db.messages.put(m);
      for (const f of folders) await db.folders.put(f);
      for (const chatId of chatsWithEvents) await deleteTutorEventsForChat(db, chatId);
      for (const e of tutorEvents) await db.tutorEvents.put(e);
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
    const [storedChats, folders, chatIdsWithMessages] = await Promise.all([
      db.chats.toArray(),
      db.folders.toArray(),
      listChatIdsWithMessages(),
    ]);
    const chats = storedChats.map(upgradeChatSystem);

    const resolvedSelected = selectedChatId || chats[0]?.id;
    const messages: Record<string, Message[]> = {};
    if (resolvedSelected && chatIdsWithMessages.includes(resolvedSelected)) {
      messages[resolvedSelected] = await getMessagesForChat(db, resolvedSelected);
    }

    return { chats, folders, messages, chatIdsWithMessages, selectedChatId: resolvedSelected };
  };

  const loadMessagesForChat = async (chatId: string): Promise<Message[]> =>
    getMessagesForChat(db, chatId);

  // Rows by id, for a tab taking in another tab's writes. A row that is
  // missing has been deleted, and is left out.
  const loadChats = async (ids: string[]): Promise<Chat[]> =>
    (await Promise.all(ids.map((id) => db.chats.get(id))))
      .filter((chat): chat is Chat => !!chat)
      .map(upgradeChatSystem);

  const loadFolders = async (ids: string[]): Promise<Folder[]> =>
    (await Promise.all(ids.map((id) => db.folders.get(id)))).filter(
      (folder): folder is Folder => !!folder,
    );

  const loadMessages = async (ids: string[]): Promise<Message[]> =>
    (await Promise.all(ids.map((id) => db.messages.get(id))))
      .filter((message): message is Message => !!message)
      .map((message) => sanitizeMessageRecord(message).next);

  const saveChatWithMessages = async (chat: Chat, list: Message[]) => {
    await runTransaction(db, [db.chats, db.messages], async () => {
      await saveChat(chat);
      for (const message of list) await saveMessage(message);
    });
  };

  const deleteChatAndMessages = async (chatId: string) => {
    await runTransaction(db, [db.chats, db.messages, db.tutorEvents], async () => {
      await db.chats.delete(chatId);
      await deleteMessagesForChat(db, chatId);
      await deleteTutorEventsForChat(db, chatId);
    });
  };

  /** A chat's tutor events in log order; rows with a malformed envelope are skipped. */
  const loadTutorEvents = async (chatId: string): Promise<TutorEventRecord[]> =>
    getTutorEventsForChat(db, chatId);

  /**
   * Appends to a chat's log. Events are immutable, so a repeated id is a
   * no-op rewrite; a position already holding a different event rejects the
   * whole append with `TutorLogConflictError` and writes nothing.
   */
  const appendTutorEvents = async (events: TutorEventRecord[]) => {
    if (!events.length) return;
    try {
      await runTransaction(db, [db.tutorEvents], async () => {
        // Every position is checked before anything is written.
        for (const event of events) {
          const existing = await tutorEventAt(db, event.chatId, event.seq);
          if (existing && existing.id !== event.id) {
            throw new TutorLogConflictError(event.chatId, event.seq);
          }
        }
        for (const event of events) await db.tutorEvents.put(event);
      });
    } catch (error) {
      // The unique [chatId+seq] index is the backstop for the check above.
      const first = events[0];
      if (isConstraintError(error)) throw new TutorLogConflictError(first.chatId, first.seq);
      throw error;
    }
  };

  /**
   * Writes a chat's first events only if its log is still empty, in one
   * transaction, so two tabs importing the same chat cannot both write.
   * Resolves false (writing nothing) when the log already had events.
   */
  const seedTutorEvents = async (chatId: string, events: TutorEventRecord[]) => {
    let seeded = false;
    await runTransaction(db, [db.tutorEvents], async () => {
      if ((await getTutorEventsForChat(db, chatId)).length) return;
      for (const event of events) await db.tutorEvents.put(event);
      seeded = true;
    });
    return seeded;
  };

  /** Deletes a chat's log alone (the chat itself is already gone). */
  const deleteTutorEvents = async (chatId: string) => {
    await runTransaction(db, [db.tutorEvents], () => deleteTutorEventsForChat(db, chatId));
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
    loadChats,
    loadFolders,
    loadMessages,
    saveChatWithMessages,
    deleteChatAndMessages,
    deleteFolder,
    loadTutorEvents,
    appendTutorEvents,
    seedTutorEvents,
    deleteTutorEvents,
  };
}

export type Repository = ReturnType<typeof createRepository>;
