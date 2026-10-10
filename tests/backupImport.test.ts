// A backup's persisted preferences are merged key by key, and only the keys
// this build persists; a backup from a newer build is refused whole.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { repository } from '@/lib/db';
import { buildChatExport, describeImport, importChatExport } from '@/lib/settings/transfer';
import { createUserMessage } from '@/lib/messages/createMessage';
import { makeChat } from './helpers/makeChat';
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

test('a file with nothing of ours in it is refused rather than reported as imported', async () => {
  for (const payload of [{}, [], { hello: 'there' }, { chats: [] }]) {
    const result = await importChatExport(JSON.stringify(payload));
    assert.equal(result.ok, false, JSON.stringify(payload));
    assert.match(result.ok ? '' : result.error, /no Dialogia chats or settings/);
  }
});

test('an import says how many chats it brought in, and how many it could not read', async () => {
  const chat = (id: string) => ({ id, title: id, createdAt: 1, updatedAt: 1, settings: {} });
  const result = await importChatExport(
    JSON.stringify({ chats: [chat('import-count-a'), chat('import-count-b'), { id: 7 }] }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.notice, 'Imported 2 chats. 1 could not be read.');

  const unreadable = await importChatExport(JSON.stringify({ chats: [{ id: 7 }, 'x'] }));
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.ok ? '' : unreadable.error, /None of the chats/);
});

test('describeImport words each outcome', () => {
  assert.equal(describeImport({ chats: 1, skippedChats: 0, settings: true }), 'Imported 1 chat.');
  assert.equal(
    describeImport({ chats: 0, skippedChats: 0, settings: true }),
    'Imported your settings.',
  );
  assert.equal(
    describeImport({ chats: 0, skippedChats: 1, settings: true }),
    'Imported your settings. 1 chat could not be read.',
  );
  assert.equal(describeImport({ chats: 0, skippedChats: 2, settings: false }), undefined);
});

test('an export is compact JSON that reads back row for row', async () => {
  const chat = makeChat({ id: 'chat-export-compact', title: 'Exported' });
  await repository.saveChat(chat);
  await repository.saveMessage(
    createUserMessage({ chatId: chat.id, content: 'Line one\nline two', createdAt: 5 }),
  );
  const exported = await buildChatExport();
  assert.equal(exported.ok, true);
  const text = await exported.blob.text();
  assert.ok(!text.includes('\n'), 'no indentation, and no line breaks outside strings');
  const parsed = JSON.parse(text);
  assert.equal(parsed.chats.find((c: { id: string }) => c.id === chat.id)?.title, 'Exported');
  assert.ok(parsed.messages.some((m: { content: string }) => m.content === 'Line one\nline two'));
  assert.equal(parsed.persistedStoreVersion, STORE_MIGRATION_VERSION);
});
