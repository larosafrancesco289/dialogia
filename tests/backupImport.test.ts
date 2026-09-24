// A backup's persisted preferences are merged key by key, and only the keys
// this build persists; a backup from a newer build is refused whole.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { repository } from '@/lib/db';
import { importChatExport } from '@/lib/settings/transfer';
import { buildStoreInitializer } from '@/lib/store/createStore';
import { mergePersistedState } from '@/lib/store/persistence';
import type { PersistedStoreState, StoreState } from '@/lib/store/types';
import { STORE_MIGRATION_VERSION } from '@/lib/store/versions';

const freshState = (): StoreState =>
  createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  ).getState();

test('only the keys this build persists are merged from a backup', () => {
  const current = freshState();
  const crafted = {
    selectedChatId: 'chat-from-backup',
    favoriteModelIds: ['a/b'],
    chats: [{ id: 'injected' }],
    messagesById: { injected: { id: 'injected' } },
    sendUserMessage: 'not a function',
    hydrated: 'yes',
  } as unknown as PersistedStoreState;

  const merged = mergePersistedState(current, crafted);

  assert.equal(merged.selectedChatId, 'chat-from-backup');
  assert.deepEqual(merged.favoriteModelIds, ['a/b']);
  assert.equal(merged.chats, current.chats);
  assert.equal(merged.messagesById, current.messagesById);
  assert.equal(merged.sendUserMessage, current.sendUserMessage);
  assert.equal(merged.hydrated, current.hydrated);
});

test('a backup written by a newer build is refused before anything is imported', async () => {
  const result = await importChatExport(
    JSON.stringify({
      chats: [
        {
          id: 'chat-from-the-future',
          title: 'Future',
          createdAt: 1,
          updatedAt: 1,
          settings: {},
        },
      ],
      messages: [],
      folders: [],
      persistedStore: { selectedChatId: 'chat-from-the-future' },
      persistedStoreVersion: STORE_MIGRATION_VERSION + 1,
    }),
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /newer version of Dialogia/);
  assert.deepEqual(await repository.loadChats(['chat-from-the-future']), []);
});
