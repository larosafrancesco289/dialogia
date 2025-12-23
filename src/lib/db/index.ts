import { createDexieDb } from '@/lib/db/dexie';
import { createMemoryDb } from '@/lib/db/memory';
import { createKvStore } from '@/lib/db/kv';
import { createRepository } from '@/lib/db/repository';

export { sanitizeMessageRecord } from '@/lib/db/sanitize';
export { DialogiaDB } from '@/lib/db/dexie';
export { InMemoryDialogiaDB } from '@/lib/db/memory';

const hasIndexedDb = typeof globalThis !== 'undefined' && (globalThis as any)?.indexedDB != null;

export const db = hasIndexedDb ? createDexieDb() : createMemoryDb();

const repository = createRepository(db);
const kvStore = createKvStore(db);

export const {
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
} = repository;

export const { kvGet, kvSet } = kvStore;
