// Module: keys/store
// Responsibility: Hold BYOK provider keys in their own IndexedDB database.
//
// Two properties matter here. The keys live in a *separate* database from the
// chat data, so `exportAll`/`importAll` cannot reach them even by accident, and
// they never enter the zustand persist blob. Reads are synchronous against an
// in-memory cache warmed by `loadKeys()` at bootstrap, because request building
// is synchronous all the way down.

import Dexie, { Table } from 'dexie';

export type StoredKey = {
  /** `apiKeyRef` from a ProviderEndpoint or a SearchProvider id. */
  ref: string;
  value: string;
  updatedAt: number;
};

export const KEY_DB_NAME = 'dialogia-keys';

class KeyDb extends Dexie {
  keys!: Table<StoredKey, string>;

  constructor(name = KEY_DB_NAME) {
    super(name);
    this.version(1).stores({ keys: 'ref' });
  }
}

type KeyTable = {
  toArray: () => Promise<StoredKey[]>;
  put: (record: StoredKey) => PromiseLike<unknown>;
  delete: (ref: string) => PromiseLike<unknown>;
};

function createMemoryKeyTable(): KeyTable {
  const records = new Map<string, StoredKey>();
  return {
    toArray: async () => Array.from(records.values()),
    put: async (record) => {
      records.set(record.ref, record);
    },
    delete: async (ref) => {
      records.delete(ref);
    },
  };
}

const hasIndexedDb =
  typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB != null;

let table: KeyTable = hasIndexedDb
  ? (new KeyDb().keys as unknown as KeyTable)
  : createMemoryKeyTable();

/** Synchronous mirror of the store; the request path cannot await. */
let cache = new Map<string, string>();
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Subscribe to key add/remove so the UI can react without holding key values. */
export function subscribeToKeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadKeys(): Promise<void> {
  if (!loaded) {
    loaded = table
      .toArray()
      .then((records) => {
        const next = new Map<string, string>();
        for (const record of records) {
          if (record?.ref && typeof record.value === 'string' && record.value) {
            next.set(record.ref, record.value);
          }
        }
        cache = next;
        emit();
      })
      .catch(() => {
        // A blocked or unavailable IndexedDB must not stop the app booting;
        // the user simply sees the setup flow again.
      });
  }
  return loaded;
}

export function getKey(ref?: string): string | undefined {
  if (!ref) return undefined;
  return cache.get(ref);
}

export function hasKey(ref?: string): boolean {
  return typeof getKey(ref) === 'string';
}

/** Refs that currently hold a key. Never returns the values. */
export function listKeyRefs(): string[] {
  return Array.from(cache.keys());
}

export async function setKey(ref: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (!ref) return;
  if (!trimmed) return deleteKey(ref);
  cache.set(ref, trimmed);
  emit();
  await table.put({ ref, value: trimmed, updatedAt: Date.now() });
}

export async function deleteKey(ref: string): Promise<void> {
  if (!ref) return;
  cache.delete(ref);
  emit();
  await table.delete(ref);
}

/** Last four characters, for confirming *which* key is stored without showing it. */
export function describeKey(ref?: string): string | undefined {
  const value = getKey(ref);
  if (!value) return undefined;
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}

/** Test seam: swap the backing table and reset the cache. */
export function resetKeyStoreForTest(next?: KeyTable) {
  table = next ?? createMemoryKeyTable();
  cache = new Map();
  loaded = null;
}
