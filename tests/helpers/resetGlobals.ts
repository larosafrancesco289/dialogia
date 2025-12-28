import { db } from '@/lib/db';
import { clearOpenRouterCachesForTest } from '@/lib/openrouter';
import { setOpenRouterMocksForTests } from '@/lib/agent/pipelineClient';
import { resetTransportRegistry } from '@/lib/transport/registry';

type ClearableTable = {
  toArray: () => Promise<{ id?: string; key?: string }[]>;
  delete: (id: string) => PromiseLike<unknown>;
};

async function clearTable(table?: ClearableTable) {
  if (!table) return;
  const entries = await table.toArray();
  await Promise.all(
    entries.map((entry) => {
      const key = entry.id ?? entry.key;
      return key ? table.delete(key) : Promise.resolve();
    }),
  );
}

export async function resetGlobals() {
  resetTransportRegistry();
  setOpenRouterMocksForTests();
  clearOpenRouterCachesForTest();

  await Promise.all([
    clearTable(db.chats),
    clearTable(db.messages),
    clearTable(db.folders),
    clearTable((db as { kv?: ClearableTable }).kv),
  ]);
}
