import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '@/lib/db';
import { createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import { createTestStore } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';
import { mockFetch } from './helpers/mockFetch';
import { neighbourChatId } from '@/lib/store/chatSlice';
import type { Chat } from '@/lib/types';

// Lazy hydration: startup loads only the selected chat's messages; every other chat's arrive on
// demand. Anything needing them all must call ensureAllChatMessagesLoaded.

let restoreFetch: () => void;
before(() => {
  // Bootstrap refreshes the ZDR lists; offline, that refresh fails quietly.
  restoreFetch = mockFetch(async () => {
    throw new Error('offline');
  });
});
after(() => restoreFetch());

let counter = 0;

/** Three saved chats: two with messages, one empty. */
async function seed() {
  const tag = `lazy-${(counter += 1)}`;
  const ids = { open: `${tag}-open`, other: `${tag}-other`, empty: `${tag}-empty` };
  for (const id of Object.values(ids)) await repository.saveChat(makeChat({ id }));
  for (const chatId of [ids.open, ids.other]) {
    await repository.saveMessage(
      createUserMessage({ id: `${chatId}-m1`, chatId, content: 'Hello', createdAt: 1 }),
    );
  }
  const store = createTestStore();
  store.setState({ selectedChatId: ids.open });
  await store.getState().initializeApp();
  return { store, ids };
}

const messageIds = (store: ReturnType<typeof createTestStore>, chatId: string) =>
  getMessagesForChat(store.getState(), chatId).map((m) => m.id);

test('startup loads only the selected chat, and notes which others have messages', async () => {
  const { store, ids } = await seed();
  const state = store.getState();

  assert.equal(state.hydrated, true);
  assert.equal(state.selectedChatId, ids.open);
  assert.deepEqual(messageIds(store, ids.open), [`${ids.open}-m1`]);
  assert.deepEqual(messageIds(store, ids.other), []);
  assert.equal(state.loadedMessageChatIds[ids.open], true);
  assert.equal(state.loadedMessageChatIds[ids.other], undefined);
  // An empty chat has nothing to load, so it counts as loaded.
  assert.equal(state.loadedMessageChatIds[ids.empty], true);
  assert.equal(state.nonEmptyChatIds[ids.other], true);
  assert.equal(state.nonEmptyChatIds[ids.empty], undefined);
});

test('ensureChatMessagesLoaded loads one chat once, keeping messages sent meanwhile', async () => {
  const { store, ids } = await seed();

  const loading = store.getState().ensureChatMessagesLoaded(ids.other);
  // A message sent while the load is in flight must survive it.
  const sent = createUserMessage({ id: `${ids.other}-sent`, chatId: ids.other, content: 'Hi' });
  store.setState((s) => appendMessagesToChat(s, ids.other, [sent]));
  await loading;

  assert.deepEqual(messageIds(store, ids.other).sort(), [`${ids.other}-m1`, sent.id].sort());
  assert.equal(store.getState().loadedMessageChatIds[ids.other], true);

  // Once loaded, the database is not read again.
  await repository.saveMessage(
    createUserMessage({ id: `${ids.other}-late`, chatId: ids.other, content: 'Late' }),
  );
  await store.getState().ensureChatMessagesLoaded(ids.other);
  assert.ok(!messageIds(store, ids.other).includes(`${ids.other}-late`));
});

test('selecting a chat loads its messages', async () => {
  const { store, ids } = await seed();
  store.getState().selectChat(ids.other);
  await store.getState().ensureChatMessagesLoaded(ids.other);
  assert.equal(store.getState().selectedChatId, ids.other);
  assert.deepEqual(messageIds(store, ids.other), [`${ids.other}-m1`]);
});

test('ensureAllChatMessagesLoaded brings every chat into memory', async () => {
  const { store, ids } = await seed();
  await store.getState().ensureAllChatMessagesLoaded();
  const state = store.getState();
  for (const id of Object.values(ids)) assert.equal(state.loadedMessageChatIds[id], true, id);
  assert.deepEqual(messageIds(store, ids.other), [`${ids.other}-m1`]);
});

test('a chat whose messages are not loaded yet is never reused as an empty draft', async () => {
  const { store, ids } = await seed();
  store.setState((s) => ({
    chats: s.chats.map((c) => (c.id === ids.other ? { ...c, title: 'New chat' } : c)),
  }));

  const before = store.getState().chats.length;
  await store.getState().newChat();

  const { chats, selectedChatId } = store.getState();
  assert.equal(chats.length, before + 1);
  assert.equal(chats[0].id, selectedChatId);
  assert.ok(!Object.values(ids).includes(selectedChatId!));
});

// Deleting a chat: the neighbour that takes its place.
const chat = (id: string, folderId?: string) => ({ id, folderId }) as Chat;

test('deleting a chat selects the next one down in the same list', () => {
  const chats = [chat('a'), chat('b'), chat('c')];
  assert.equal(neighbourChatId(chats, 'b'), 'c');
});

test('deleting the last chat in a list selects the one above', () => {
  const chats = [chat('a'), chat('b'), chat('c')];
  assert.equal(neighbourChatId(chats, 'c'), 'b');
});

test('a chat in a folder hands over to a sibling in that folder', () => {
  const chats = [chat('r1'), chat('f1', 'F'), chat('r2'), chat('f2', 'F'), chat('r3')];
  assert.equal(neighbourChatId(chats, 'f1'), 'f2');
  assert.equal(neighbourChatId(chats, 'r2'), 'r3');
});

test('the only chat in its folder falls back to the nearest chat anywhere', () => {
  const chats = [chat('r1'), chat('f1', 'F'), chat('r2')];
  assert.equal(neighbourChatId(chats, 'f1'), 'r2');
  assert.equal(neighbourChatId([chat('only')], 'only'), undefined);
});
