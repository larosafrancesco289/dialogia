import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { repository } from '@/lib/db';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { connectTabSync, OTHER_TAB_REPLY_TIMEOUT_MS } from '@/lib/store/tabSync';
import { createTabChannel, type TabAnnouncement } from '@/lib/sync/tabChannel';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import { adjustActiveTurnCount, clearActiveTurnCount } from '@/lib/ui/streaming';
import type { Chat, Message } from '@/lib/types';
import { createFakeBus } from './helpers/fakeTabBus';

const newStore = () =>
  createStore<StoreState>(buildStoreInitializer() as unknown as StateCreator<StoreState>);

let counter = 0;
const uniqueId = (label: string) => `${label}-${(counter += 1)}`;

const makeChat = (id: string, title = 'Chat'): Chat => ({
  id,
  title,
  createdAt: 1,
  updatedAt: 1,
  settings: {
    modelId: 'provider/model',
    generation: {},
    ui: {
      showThinkingByDefault: false,
      showStats: false,
      showToolCallLog: false,
      showDebugRawJson: false,
    },
    features: { search: { enabled: false, provider: 'openrouter' }, tutor: { enabled: false } },
  },
});

/**
 * Two tabs over the one (in-memory) database, joined by a fake BroadcastChannel.
 * In Node the repository's own announcements go nowhere, so a test posts, from
 * the writing tab, exactly what the repository would have announced.
 */
function twoTabs(chats: Chat[]) {
  const bus = createFakeBus();
  let clock = 1_000;
  const tab = () => {
    const store = newStore();
    const channel = createTabChannel(bus.open);
    const heard: TabAnnouncement[] = [];
    channel.subscribe((announcement) => heard.push(announcement));
    const sync = connectTabSync(store, channel, {
      now: () => clock,
      every: () => () => undefined,
    });
    store.setState({
      chats,
      hydrated: true,
      loadedMessageChatIds: Object.fromEntries(chats.map((c) => [c.id, true as const])),
    });
    return { store, channel, heard, sync };
  };
  const a = tab();
  const b = tab();
  const settle = async () => {
    for (let i = 0; i < 3; i += 1) {
      await bus.settle();
      await Promise.all([a.sync.idle(), b.sync.idle()]);
    }
  };
  return {
    a,
    b,
    bus,
    settle,
    advance: (ms: number) => {
      clock += ms;
    },
    close: () => {
      a.sync.disconnect();
      b.sync.disconnect();
    },
  };
}

async function savedChat(title = 'Chat') {
  const chat = makeChat(uniqueId('chat'), title);
  await repository.saveChat(chat);
  return chat;
}

const messageIds = (store: ReturnType<typeof newStore>, chatId: string) =>
  getMessagesForChat(store.getState(), chatId).map((m) => m.id);

/** A turn starting in a tab, the way the turn service counts it. */
function startTurn(store: ReturnType<typeof newStore>, chatId: string, messages: Message[]) {
  store.setState((s) => ({
    ...appendMessagesToChat(s, chatId, messages),
    ui: adjustActiveTurnCount(s.ui, chatId, 1),
  }));
}

const endTurn = (store: ReturnType<typeof newStore>, chatId: string) =>
  store.setState((s) => ({ ui: clearActiveTurnCount(s.ui, chatId) }));

test('a rename in one tab shows in the other, and a new chat appears there', async () => {
  const chat = await savedChat('Before');
  const tabs = twoTabs([chat]);
  try {
    await tabs.a.store.getState().renameChat(chat.id, 'After');
    tabs.a.channel.post({ kind: 'chats', ids: [chat.id] });
    const created = await savedChat('Made in A');
    tabs.a.channel.post({ kind: 'chats', ids: [created.id] });
    await tabs.settle();

    const chatsInB = tabs.b.store.getState().chats;
    assert.equal(chatsInB.find((c) => c.id === chat.id)?.title, 'After');
    assert.equal(chatsInB[0].id, created.id, 'a new chat lands on top, as a local one does');
  } finally {
    tabs.close();
  }
});

test('folders follow: created, renamed and deleted', async () => {
  const tabs = twoTabs([]);
  try {
    const folder = await tabs.a.store.getState().createFolder('Reading');
    tabs.a.channel.post({ kind: 'folders', ids: [folder.id] });
    await tabs.settle();
    assert.equal(tabs.b.store.getState().folders[0]?.name, 'Reading');

    await tabs.a.store.getState().renameFolder(folder.id, 'Papers');
    tabs.a.channel.post({ kind: 'folders', ids: [folder.id] });
    await tabs.settle();
    assert.equal(tabs.b.store.getState().folders[0]?.name, 'Papers');

    await tabs.a.store.getState().deleteFolder(folder.id);
    tabs.a.channel.post({ kind: 'folderDeleted', id: folder.id });
    await tabs.settle();
    assert.deepEqual(tabs.b.store.getState().folders, []);
  } finally {
    tabs.close();
  }
});

test('saved messages reload into a chat that is loaded, and only mark one that is not', async () => {
  const loaded = await savedChat();
  const lazy = await savedChat();
  const tabs = twoTabs([loaded, lazy]);
  tabs.b.store.setState((s) => {
    const loadedMessageChatIds = { ...s.loadedMessageChatIds };
    delete loadedMessageChatIds[lazy.id];
    return { loadedMessageChatIds };
  });
  try {
    const first = createUserMessage({ chatId: loaded.id, content: 'one', createdAt: 1 });
    const second = createUserMessage({ chatId: loaded.id, content: 'two', createdAt: 2 });
    const elsewhere = createUserMessage({ chatId: lazy.id, content: 'three', createdAt: 3 });
    tabs.b.store.setState((s) => appendMessagesToChat(s, loaded.id, [first]));
    await repository.saveMessages([first, second]);
    await repository.saveMessage({ ...first, content: 'one, edited' });
    await repository.saveMessage(elsewhere);
    tabs.a.channel.post({ kind: 'messages', chatId: loaded.id, ids: [first.id, second.id] });
    tabs.a.channel.post({ kind: 'messages', chatId: lazy.id, ids: [elsewhere.id] });
    await tabs.settle();

    const b = tabs.b.store.getState();
    assert.deepEqual(messageIds(tabs.b.store, loaded.id), [first.id, second.id]);
    assert.equal(b.messagesById[first.id].content, 'one, edited');
    assert.deepEqual(messageIds(tabs.b.store, lazy.id), [], 'lazy hydration is left to load it');
    assert.equal(b.nonEmptyChatIds[lazy.id], true);
    assert.equal(b.loadedMessageChatIds[lazy.id], undefined);

    await tabs.b.store.getState().ensureChatMessagesLoaded(lazy.id);
    assert.deepEqual(messageIds(tabs.b.store, lazy.id), [elsewhere.id]);
  } finally {
    tabs.close();
  }
});

test('while this tab writes a reply, another tab’s messages wait until it ends', async () => {
  const chat = await savedChat();
  const tabs = twoTabs([chat]);
  try {
    const mine = createUserMessage({ chatId: chat.id, content: 'mine', createdAt: 1 });
    const reply = createAssistantMessage({ chatId: chat.id, content: '', createdAt: 2 });
    startTurn(tabs.b.store, chat.id, [mine, reply]);
    tabs.b.store.setState((s) => ({
      messagesById: { ...s.messagesById, [reply.id]: { ...reply, content: 'streaming here' } },
    }));

    // The other tab's copy of this tab's reply is older than what is on screen.
    await repository.saveMessage({ ...reply, content: 'stale checkpoint' });
    const theirs = createUserMessage({ chatId: chat.id, content: 'theirs', createdAt: 3 });
    await repository.saveMessage(theirs);
    tabs.a.channel.post({ kind: 'messages', chatId: chat.id, ids: [reply.id, theirs.id] });
    await tabs.settle();
    assert.deepEqual(messageIds(tabs.b.store, chat.id), [mine.id, reply.id], 'nothing adopted');
    assert.equal(tabs.b.store.getState().messagesById[reply.id].content, 'streaming here');

    // The reply ends, saved as it finished; then the deferred rows come in.
    await repository.saveMessage({ ...reply, content: 'finished' });
    tabs.b.store.setState((s) => ({
      messagesById: { ...s.messagesById, [reply.id]: { ...reply, content: 'finished' } },
    }));
    endTurn(tabs.b.store, chat.id);
    await tabs.settle();
    assert.deepEqual(messageIds(tabs.b.store, chat.id), [mine.id, reply.id, theirs.id]);
    assert.equal(tabs.b.store.getState().messagesById[reply.id].content, 'finished');
  } finally {
    tabs.close();
  }
});

test('a tab never re-announces or re-saves what it adopted', async () => {
  const chat = await savedChat();
  const doomed = await savedChat();
  const tabs = twoTabs([chat, doomed]);
  const writes: string[] = [];
  const spied = [
    'saveChat',
    'saveMessage',
    'saveMessages',
    'saveFolder',
    'saveChatWithMessages',
    'deleteChatAndMessages',
    'deleteFolder',
    'appendTutorEvents',
    'seedTutorEvents',
    'deleteTutorEvents',
    'importAll',
  ] as const;
  const originals = spied.map((name) => repository[name]);
  try {
    await tabs.settle();
    tabs.a.heard.length = 0;
    const message = createUserMessage({ chatId: chat.id, content: 'hi', createdAt: 1 });
    await repository.saveMessage(message);
    await repository.saveChat({ ...chat, title: 'Renamed' });
    await repository.deleteChatAndMessages(doomed.id);
    spied.forEach((name) => {
      (repository as Record<string, unknown>)[name] = async () => {
        writes.push(name);
      };
    });

    tabs.a.channel.post({ kind: 'chats', ids: [chat.id] });
    tabs.a.channel.post({ kind: 'messages', chatId: chat.id, ids: [message.id] });
    tabs.a.channel.post({ kind: 'chatDeleted', id: doomed.id });
    tabs.a.channel.post({ kind: 'tutorEvents', chatId: chat.id });
    tabs.a.channel.post({ kind: 'streaming', chatId: chat.id, replyIds: ['r1'], writing: true });
    tabs.a.channel.post({ kind: 'streaming', chatId: chat.id, replyIds: ['r1'], writing: false });
    await tabs.settle();

    assert.equal(tabs.b.store.getState().chats.find((c) => c.id === chat.id)?.title, 'Renamed');
    assert.deepEqual(tabs.a.heard, [], 'B said nothing back');
    assert.deepEqual(writes, [], 'B wrote nothing');
  } finally {
    spied.forEach((name, i) => {
      (repository as Record<string, unknown>)[name] = originals[i];
    });
    tabs.close();
  }
});

test('a chat deleted in another tab goes, and selection moves as a local delete moves it', async () => {
  const [first, open, next] = [await savedChat(), await savedChat(), await savedChat()];
  const tabs = twoTabs([first, open, next]);
  tabs.b.store.setState({ selectedChatId: open.id });
  try {
    await tabs.a.store.getState().deleteChat(open.id);
    tabs.a.channel.post({ kind: 'chatDeleted', id: open.id });
    await tabs.settle();
    const b = tabs.b.store.getState();
    assert.deepEqual(
      b.chats.map((c) => c.id),
      [first.id, next.id],
    );
    assert.equal(b.selectedChatId, next.id);
  } finally {
    tabs.close();
  }
});

test('a writing tab that goes silent is let go after the timeout', async () => {
  const chat = await savedChat();
  const tabs = twoTabs([chat]);
  try {
    const reply = createAssistantMessage({ chatId: chat.id, content: '', createdAt: 2 });
    startTurn(tabs.a.store, chat.id, [reply]);
    await tabs.settle();
    assert.deepEqual(tabs.b.store.getState().repliesInOtherTabs[chat.id], [reply.id]);

    // Its heartbeat keeps it alive...
    tabs.advance(OTHER_TAB_REPLY_TIMEOUT_MS - 1_000);
    tabs.a.sync.tick();
    await tabs.settle();
    tabs.advance(2_000);
    tabs.b.sync.tick();
    await tabs.settle();
    assert.deepEqual(tabs.b.store.getState().repliesInOtherTabs[chat.id], [reply.id]);

    // ...until it stops (a frozen or killed tab says nothing).
    tabs.a.sync.disconnect();
    tabs.advance(OTHER_TAB_REPLY_TIMEOUT_MS + 1);
    tabs.b.sync.tick();
    await tabs.settle();
    assert.equal(tabs.b.store.getState().repliesInOtherTabs[chat.id], undefined);
  } finally {
    tabs.close();
  }
});

test('a tab that closes mid-reply says so, and a tab that opens learns of replies under way', async () => {
  const chat = await savedChat();
  const tabs = twoTabs([chat]);
  try {
    const reply = createAssistantMessage({ chatId: chat.id, content: '', createdAt: 2 });
    startTurn(tabs.a.store, chat.id, [reply]);
    await tabs.settle();

    const late = newStore();
    const lateSync = connectTabSync(late, createTabChannel(tabs.bus.open), {
      every: () => () => undefined,
    });
    await tabs.settle();
    await lateSync.idle();
    assert.deepEqual(late.getState().repliesInOtherTabs[chat.id], [reply.id]);

    tabs.a.sync.pageHidden();
    await tabs.settle();
    await lateSync.idle();
    assert.equal(tabs.b.store.getState().repliesInOtherTabs[chat.id], undefined);
    assert.equal(late.getState().repliesInOtherTabs[chat.id], undefined);
    lateSync.disconnect();
  } finally {
    tabs.close();
  }
});

test('an import in another tab reloads everything, after this tab’s reply ends', async () => {
  const chat = await savedChat();
  const tabs = twoTabs([chat]);
  let reloads = 0;
  tabs.b.store.setState({
    initializeApp: async () => {
      reloads += 1;
    },
  });
  try {
    startTurn(tabs.b.store, chat.id, [
      createAssistantMessage({ chatId: chat.id, content: '', createdAt: 2 }),
    ]);
    tabs.a.channel.post({ kind: 'replaced' });
    await tabs.settle();
    assert.equal(reloads, 0);
    endTurn(tabs.b.store, chat.id);
    await tabs.settle();
    assert.equal(reloads, 1);
  } finally {
    tabs.close();
  }
});
