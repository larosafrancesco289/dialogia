// Keys travel between tabs as a bare "keys changed": the receiving tab reads
// its own copy from IndexedDB, and never hears the key itself.

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import {
  deleteKey,
  getKey,
  loadKeys,
  resetKeyStoreForTest,
  setKey,
  type StoredKey,
} from '@/lib/keys/store';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { connectTabSync } from '@/lib/store/tabSync';
import { createTabChannel, parseAnnouncement } from '@/lib/sync/tabChannel';
import { createFakeBus } from './helpers/fakeTabBus';

afterEach(() => resetKeyStoreForTest());

/** One key table standing in for the `dialogia-keys` database every tab shares. */
function sharedTable() {
  const records = new Map<string, StoredKey>();
  return {
    records,
    toArray: async () => [...records.values()],
    put: async (record: StoredKey) => {
      records.set(record.ref, record);
    },
    delete: async (ref: string) => {
      records.delete(ref);
    },
  };
}

test('a keys announcement parses, and carries nothing but its kind', () => {
  assert.deepEqual(parseAnnouncement({ kind: 'keys' }), { kind: 'keys' });
  assert.deepEqual(parseAnnouncement({ kind: 'keys', ref: 'openrouter', value: 'sk-secret' }), {
    kind: 'keys',
  });
});

test('saving or removing a key announces it without the key', async () => {
  const posted: unknown[] = [];
  resetKeyStoreForTest(sharedTable(), () => posted.push('keys'));
  await setKey('openrouter', 'sk-or-new');
  await deleteKey('openrouter');
  assert.deepEqual(posted, ['keys', 'keys']);
});

test('a tab told the keys changed reads them again and reloads its models', async () => {
  const table = sharedTable();
  table.records.set('openrouter', { ref: 'openrouter', value: 'sk-old', updatedAt: 1 });
  resetKeyStoreForTest(table, () => undefined);
  await loadKeys();
  assert.equal(getKey('openrouter'), 'sk-old');

  const bus = createFakeBus();
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  let modelLoads = 0;
  store.setState({
    loadModels: async () => {
      modelLoads += 1;
    },
  });
  const sync = connectTabSync(store, createTabChannel(bus.open), { every: () => () => undefined });
  const otherTab = createTabChannel(bus.open);

  // The other tab rotates the key in the shared database, then says so.
  table.records.set('openrouter', { ref: 'openrouter', value: 'sk-rotated', updatedAt: 2 });
  otherTab.post({ kind: 'keys' });
  await bus.settle();
  await sync.idle();

  assert.equal(getKey('openrouter'), 'sk-rotated');
  assert.equal(modelLoads, 1);

  table.records.delete('openrouter');
  otherTab.post({ kind: 'keys' });
  await bus.settle();
  await sync.idle();
  assert.equal(getKey('openrouter'), undefined);
  sync.disconnect();
});

test('a failed first read of the keys is tried again on the next load', async () => {
  const table = sharedTable();
  table.records.set('openrouter', { ref: 'openrouter', value: 'sk-or', updatedAt: 1 });
  let failures = 1;
  resetKeyStoreForTest(
    {
      ...table,
      toArray: async () => {
        if (failures-- > 0) throw new Error('UnknownError: database unavailable');
        return table.toArray();
      },
    },
    () => undefined,
  );
  await loadKeys();
  assert.equal(getKey('openrouter'), undefined);
  await loadKeys();
  assert.equal(getKey('openrouter'), 'sk-or');
});
