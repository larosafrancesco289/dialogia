import { createDexieDb } from '@/lib/db/dexie';
import { createMemoryDb } from '@/lib/db/memory';
import { createKvStore } from '@/lib/db/kv';
import { createRepository } from '@/lib/db/repository';
import { announceWrites } from '@/lib/db/announce';
import { tabChannel } from '@/lib/sync/tabChannel';

export { TutorLogConflictError } from '@/lib/db/repository';

const hasIndexedDb =
  typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB != null;

export const db = hasIndexedDb ? createDexieDb() : createMemoryDb();

// Every write is announced to the other tabs once it has landed.
export const repository = announceWrites(createRepository(db), tabChannel.post);
const kvStore = createKvStore(db);

export const {
  saveChat,
  saveMessage,
  saveFolder,
  getChatWithMessages,
  exportAll,
  importAll,
  loadRepositorySnapshot,
  loadMessagesForChat,
  saveChatWithMessages,
  deleteChatAndMessages,
  deleteFolder,
} = repository;

export const { kvGet, kvSet } = kvStore;
