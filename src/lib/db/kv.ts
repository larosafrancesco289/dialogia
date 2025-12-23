import type { KVRecord } from '@/lib/types';

type KvTable = {
  put: (record: KVRecord) => PromiseLike<unknown>;
  get: (key: string) => Promise<KVRecord | undefined>;
};

export type KvStore = {
  kvSet: <T>(key: string, value: T) => Promise<void>;
  kvGet: <T>(key: string) => Promise<T | undefined>;
};

export function createKvStore(db: { kv: KvTable }): KvStore {
  return {
    async kvSet<T>(key: string, value: T) {
      await db.kv.put({ key, value });
    },
    async kvGet<T>(key: string): Promise<T | undefined> {
      const rec = await db.kv.get(key);
      return rec ? (rec.value as T) : undefined;
    },
  };
}
