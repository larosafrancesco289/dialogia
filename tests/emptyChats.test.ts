import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '@/lib/db';
import { createUserMessage } from '@/lib/messages/createMessage';
import { DEFAULT_CHAT_TITLE } from '@/lib/services/chatService';
import { EMPTY_CHAT_GRACE_MS } from '@/lib/store/chatSlice';
import { createChatPresence, type LockPort } from '@/lib/sync/chatPresence';
import { writeDraft } from '@/lib/ui/composerDrafts';
import { createTestStore } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';
import { mockFetch } from './helpers/mockFetch';

// An empty "New chat" leaves no row behind once the person moves on, and
// startup tidies away what a closed tab left. Anything used stays.

let restoreFetch: () => void;
before(() => {
  // Bootstrap refreshes the ZDR lists; offline, that refresh fails quietly.
  restoreFetch = mockFetch(async () => {
    throw new Error('offline');
  });
});
after(() => restoreFetch());

let counter = 0;
const OLD = Date.now() - EMPTY_CHAT_GRACE_MS - 1_000;

/** A chat with a message (opened first) and an empty new chat, both old. */
async function seed() {
  const tag = `empty-${(counter += 1)}`;
  const used = `${tag}-used`;
  const blank = `${tag}-blank`;
  await repository.saveChat(makeChat({ id: used, createdAt: OLD, updatedAt: OLD }));
  await repository.saveMessage(
    createUserMessage({ id: `${used}-m1`, chatId: used, content: 'Hello', createdAt: 1 }),
  );
  const store = createTestStore();
  store.setState({ selectedChatId: blank });
  await repository.saveChat(
    makeChat({
      id: blank,
      title: DEFAULT_CHAT_TITLE,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await store.getState().initializeApp();
  return { store, used, blank };
}

/** The cleanup after leaving a chat runs on its own; give it time to land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const hasChat = (store: ReturnType<typeof createTestStore>, id: string) =>
  store.getState().chats.some((c) => c.id === id);

const onDisk = async (id: string) => (await repository.loadChats([id])).length > 0;

test('leaving an empty new chat removes it, from the list and from disk', async () => {
  const { store, used, blank } = await seed();
  assert.ok(hasChat(store, blank), 'kept while open');

  store.getState().selectChat(used);
  await settle();

  assert.ok(!hasChat(store, blank));
  assert.equal(await onDisk(blank), false);
  assert.equal(store.getState().selectedChatId, used);
});

test('a new chat started from an empty one reuses it, and leaving the new one removes it', async () => {
  const { store, used, blank } = await seed();
  const before = store.getState().chats.length;
  await store.getState().newChat();
  assert.equal(store.getState().selectedChatId, blank);
  assert.equal(store.getState().chats.length, before);

  store.getState().selectChat(used);
  await settle();
  await store.getState().newChat();
  const fresh = store.getState().selectedChatId!;
  assert.ok(fresh !== used && hasChat(store, fresh));
  assert.ok(hasChat(store, used), 'a chat with messages is never removed');

  store.getState().selectChat(used);
  await settle();
  assert.ok(!hasChat(store, fresh));
});

test('a chat with an unsent draft, a title or a message stays after leaving', async () => {
  const drafted = await seed();
  writeDraft(drafted.blank, 'half a thought');
  drafted.store.getState().selectChat(drafted.used);
  await settle();
  assert.ok(hasChat(drafted.store, drafted.blank), 'draft');
  writeDraft(drafted.blank, '');

  const titled = await seed();
  await titled.store.getState().renameChat(titled.blank, 'Ideas');
  titled.store.getState().selectChat(titled.used);
  await settle();
  assert.ok(hasChat(titled.store, titled.blank), 'title');

  // Written by another tab, and not heard of here yet.
  const written = await seed();
  await repository.saveMessage(
    createUserMessage({ id: `${written.blank}-m1`, chatId: written.blank, content: 'Hi' }),
  );
  written.store.getState().selectChat(written.used);
  await settle();
  assert.ok(hasChat(written.store, written.blank), 'message on disk');
});

test('a chat with a tutor log stays after leaving', async () => {
  const { store, used, blank } = await seed();
  await repository.appendTutorEvents([
    {
      id: `${blank}-e1`,
      chatId: blank,
      seq: 1,
      at: 1,
      by: 'tutor',
      type: 'topic_started',
      nodeId: 'limits',
    },
  ]);
  store.getState().selectChat(used);
  await settle();
  assert.ok(hasChat(store, blank));
});

test('startup removes empty chats left behind, but not the open one or a recent one', async () => {
  const tag = `startup-${(counter += 1)}`;
  const ids = { open: `${tag}-open`, stale: `${tag}-stale`, recent: `${tag}-recent` };
  const untitled = { title: DEFAULT_CHAT_TITLE };
  await repository.saveChat(
    makeChat({ id: ids.open, ...untitled, createdAt: OLD, updatedAt: OLD }),
  );
  await repository.saveChat(
    makeChat({ id: ids.stale, ...untitled, createdAt: OLD, updatedAt: OLD }),
  );
  await repository.saveChat(
    makeChat({ id: ids.recent, ...untitled, createdAt: Date.now(), updatedAt: Date.now() }),
  );

  const store = createTestStore();
  store.setState({ selectedChatId: ids.open });
  await store.getState().initializeApp();

  assert.ok(hasChat(store, ids.open), 'open');
  assert.ok(hasChat(store, ids.recent), 'recent: another tab may have just made it');
  assert.ok(!hasChat(store, ids.stale));
  assert.equal(await onDisk(ids.stale), false);
});

/** A lock manager shared by every "tab" built on it, as the browser's is. */
function fakeLocks(): LockPort {
  const held = new Set<string>();
  return {
    async request(name, callback) {
      held.add(name);
      try {
        await callback();
      } finally {
        held.delete(name);
      }
    },
    async query() {
      return { held: [...held].map((name) => ({ name })) };
    },
  };
}

test('a tab sees the chats other tabs have open, never its own', async () => {
  const locks = fakeLocks();
  const here = createChatPresence(locks, 'tab-here');
  const there = createChatPresence(locks, 'tab-there');

  here.hold('a');
  there.hold('b');
  await settle();
  assert.deepEqual([...(await here.openElsewhere())], ['b']);
  assert.deepEqual([...(await there.openElsewhere())], ['a']);

  // Moving on lets go of the chat left.
  there.hold('c');
  await settle();
  assert.deepEqual([...(await here.openElsewhere())], ['c']);
  there.hold(undefined);
  await settle();
  assert.deepEqual([...(await here.openElsewhere())], []);
});

test('without Web Locks nothing is reported open elsewhere', async () => {
  const presence = createChatPresence(undefined, 'tab');
  presence.hold('a');
  assert.equal((await presence.openElsewhere()).size, 0);
});
