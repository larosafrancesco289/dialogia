// Try again keeps the old reply as a version. The shown version is the
// message's own fields, so it is what the transcript, the next request, a
// branch and the other tabs see; versions change only in the latest exchange.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '@/lib/db';
import { createMemoryDb } from '@/lib/db/memory';
import { createRepository } from '@/lib/db/repository';
import { sanitizeMessageRecord } from '@/lib/db/sanitize';
import { regenerate } from '@/lib/agent/regenerate';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { buildTransportAuth } from '@/lib/auth/transport';
import { loadModuleRuntimes } from '@/lib/modules';
import { createModelIndex } from '@/lib/models';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import {
  addVersion,
  onlyShownVersion,
  removeShownVersion,
  showVersion,
  shownVersionIndex,
  versionCount,
} from '@/lib/messages/versions';
import { adjustActiveTurnCount } from '@/lib/ui/streaming';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import type { StreamCallbacks } from '@/lib/transport/types';
import type { Message, ModelDescriptor } from '@/lib/types';
import { createTestStore } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';
import { mockFetch } from './helpers/mockFetch';

let restoreFetch: () => void;
before(async () => {
  await loadModuleRuntimes();
  restoreFetch = mockFetch(async () => {
    throw new Error('offline');
  });
});
after(() => restoreFetch());

const reply = (content: string, extra: Partial<Message> = {}): Message => ({
  ...createAssistantMessage({ id: 'r1', chatId: 'c1', content, createdAt: 5 }),
  ...extra,
});

test('a new attempt keeps the old reply, with its own model, thoughts, sources and cost', () => {
  const old = reply('First answer', {
    model: 'a/one',
    reasoning: 'Thinking about it',
    metrics: { ttftMs: 300, completionMs: 900 },
    usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.002 } as Message['usage'],
    annotations: [{ type: 'url_citation', url_citation: { url: 'https://a.example' } }],
    toolRounds: [{ text: '', calls: [{ id: 't', name: 'x', arguments: '{}', result: '{}' }] }],
  });
  const next = addVersion(old, reply('', { model: 'b/two' }));

  assert.equal(next.content, '');
  assert.equal(next.model, 'b/two');
  assert.equal(next.annotations, undefined);
  assert.equal(next.toolRounds, undefined);
  assert.equal(versionCount(next), 2);
  assert.equal(shownVersionIndex(next), 1);
  assert.equal(next.versionIndex, undefined, 'the newest is shown without an index');
  const [kept] = next.versions ?? [];
  assert.equal(kept.content, 'First answer');
  assert.equal(kept.model, 'a/one');
  assert.equal(kept.reasoning, 'Thinking about it');
  assert.deepEqual(kept.metrics, old.metrics);
  assert.deepEqual(kept.usage, old.usage);
  assert.deepEqual(kept.annotations, old.annotations);
  assert.equal((kept as Record<string, unknown>).id, undefined, 'a version is not a message');
});

test('a shown version with nothing in it is replaced, not kept', () => {
  const two = addVersion(reply('One'), reply('Two'));
  const failed = { ...two, content: '', reasoning: '', cutOff: 'failed' as const };
  const three = addVersion(failed, reply('Three'));
  assert.deepEqual(
    [0, 1].map((i) => showVersion(three, i).content),
    ['One', 'Three'],
  );
  assert.equal(addVersion(reply(''), reply('Only')).versions, undefined);
});

test('showing a version swaps every field of its own and nothing else', () => {
  const one = reply('One', { model: 'a/one', toolRounds: [] as Message['toolRounds'] });
  const both = { ...addVersion(one, reply('Two', { model: 'b/two' })), metadata: { kind: 'k' } };
  const first = showVersion(both, 0);
  assert.equal(first.content, 'One');
  assert.equal(first.model, 'a/one');
  assert.equal(first.versionIndex, 0);
  assert.equal(first.id, 'r1');
  assert.equal(first.createdAt, 5, 'the reply keeps its place in the transcript');
  assert.deepEqual(first.metadata, { kind: 'k' });
  const back = showVersion(first, 1);
  assert.equal(back.content, 'Two');
  assert.equal(back.model, 'b/two');
  assert.equal('toolRounds' in back, false, 'one version never leaks into another');
  assert.equal(back.versionIndex, undefined);
  assert.equal(showVersion(back, 1), back);
  assert.equal(showVersion(back, 7), back);
});

test('deleting the shown version shows the one before it, or the next when it was first', () => {
  let three = addVersion(addVersion(reply('One'), reply('Two')), reply('Three'));
  three = showVersion(three, 1);
  const afterMiddle = removeShownVersion(three);
  assert.equal(afterMiddle.content, 'One');
  assert.equal(versionCount(afterMiddle), 2);
  const afterFirst = removeShownVersion(afterMiddle);
  assert.equal(afterFirst.content, 'Three');
  assert.equal(afterFirst.versions, undefined);
  assert.equal(afterFirst.versionIndex, undefined);
  assert.equal(removeShownVersion(afterFirst), afterFirst, 'the last version is the reply');
});

test('a branch copy carries the shown version only', () => {
  const both = showVersion(addVersion(reply('One'), reply('Two')), 0);
  const copy = onlyShownVersion(both);
  assert.equal(copy.content, 'One');
  assert.equal('versions' in copy, false);
  assert.equal('versionIndex' in copy, false);
});

// ---- Regenerate ----------------------------------------------------------

const MODEL: ModelDescriptor = {
  id: 'provider/model',
  name: 'Model',
  context_length: 32000,
  pricing: undefined,
  raw: {},
};

function regenSetup(original: Message, earlier: Message[] = []) {
  const chat = makeChat({ id: original.chatId, settings: { modelId: MODEL.id } });
  const store = createTestStore();
  const user = createUserMessage({ chatId: chat.id, content: 'Question?', createdAt: 1 });
  store.setState((s) => ({
    chats: [chat],
    selectedChatId: chat.id,
    models: [MODEL],
    modelIndex: createModelIndex([MODEL]),
    ...appendMessagesToChat(s, chat.id, [...earlier, user, original]),
  }));
  const persisted: Message[] = [];
  const requests: unknown[] = [];
  const run = (opts: { keepVersions?: boolean; answer?: string }) =>
    regenerate({
      chat,
      chatId: chat.id,
      targetMessageId: original.id,
      messages: getMessagesForChat(store.getState(), chat.id),
      turn: {
        auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test-key' }),
        set: store.setState,
        get: store.getState,
        models: [MODEL],
        modelIndex: store.getState().modelIndex,
        persistMessage: async (message) => {
          persisted.push(message);
        },
      },
      controller: new AbortController(),
      keepVersions: opts.keepVersions,
      pipeline: createPipelineClient({
        streamChatCompletion: async (params) => {
          requests.push(params.messages);
          const callbacks = params.callbacks as StreamCallbacks;
          if (!opts.answer) {
            const error = new Error('refused');
            callbacks.onError?.(error);
            throw error;
          }
          callbacks.onToken?.(opts.answer);
          await callbacks.onDone?.(opts.answer, { finishReason: 'stop' });
        },
      }),
    });
  const current = () => store.getState().messagesById[original.id];
  return { store, persisted, requests, run, current };
}

test('Try again adds a version, shows it, and saves both', async () => {
  const original = createAssistantMessage({
    chatId: 'regen-keep',
    content: 'Original answer',
    createdAt: 2,
    model: 'old/model',
  });
  const s = regenSetup(original);
  await s.run({ keepVersions: true, answer: 'New answer' });
  const shown = s.current();
  assert.equal(shown?.content, 'New answer');
  assert.equal(shown?.model, MODEL.id);
  assert.equal(shown && versionCount(shown), 2);
  assert.equal(shown?.versions?.[0]?.content, 'Original answer');
  assert.equal(shown?.versions?.[0]?.model, 'old/model');
  const saved = s.persisted.filter((m) => m.id === original.id).at(-1);
  assert.equal(saved?.content, 'New answer');
  assert.equal(saved?.versions?.[0]?.content, 'Original answer');
});

test('the model reads an earlier reply as its shown version, and no other', async () => {
  const chatId = 'regen-context';
  const earlier = [
    createUserMessage({ chatId, content: 'First question', createdAt: -2 }),
    showVersion(
      addVersion(
        createAssistantMessage({ id: 'e', chatId, content: 'Shown words', createdAt: -1 }),
        createAssistantMessage({ id: 'e', chatId, content: 'Other words', createdAt: -1 }),
      ),
      0,
    ),
  ];
  const original = createAssistantMessage({ chatId, content: 'Latest', createdAt: 2 });
  const s = regenSetup(original, earlier);
  await s.run({ keepVersions: true, answer: 'Again' });
  const sent = JSON.stringify(s.requests);
  assert.ok(sent.includes('Shown words'));
  assert.ok(!sent.includes('Other words'));
  assert.ok(!sent.includes('Latest'), 'nor the version being tried again');
});

test("an edit's rerun replaces the reply and its versions, as before", async () => {
  const original = addVersion(
    createAssistantMessage({ id: 'r-edit', chatId: 'regen-edit', content: 'One', createdAt: 2 }),
    createAssistantMessage({ id: 'r-edit', chatId: 'regen-edit', content: 'Two', createdAt: 2 }),
  );
  const s = regenSetup(original);
  await s.run({ answer: 'Answer to the new words' });
  assert.equal(s.current()?.content, 'Answer to the new words');
  assert.equal(s.current()?.versions, undefined);
});

test('an attempt that fails before a word leaves the reply and its versions as they were', async () => {
  const original = showVersion(
    addVersion(
      createAssistantMessage({ id: 'r-fail', chatId: 'regen-fail', content: 'One', createdAt: 2 }),
      createAssistantMessage({ id: 'r-fail', chatId: 'regen-fail', content: 'Two', createdAt: 2 }),
    ),
    0,
  );
  const s = regenSetup(original);
  await assert.rejects(s.run({ keepVersions: true }));
  assert.equal(s.current(), original);
  assert.deepEqual(
    s.persisted.filter((m) => m.id === original.id),
    [],
  );
});

// ---- Store actions ---------------------------------------------------------

let seeded = 0;
async function storeSetup({ laterTurn = false } = {}) {
  const chatId = `versions-${(seeded += 1)}`;
  const chat = makeChat({ id: chatId });
  const user = createUserMessage({ id: `${chatId}-u`, chatId, content: 'Hi', createdAt: 1 });
  const answer = addVersion(
    addVersion(
      createAssistantMessage({ id: `${chatId}-a`, chatId, content: 'One', createdAt: 2 }),
      createAssistantMessage({ id: `${chatId}-a`, chatId, content: 'Two', createdAt: 2 }),
    ),
    createAssistantMessage({ id: `${chatId}-a`, chatId, content: 'Three', createdAt: 2 }),
  );
  const later = createUserMessage({ id: `${chatId}-u2`, chatId, content: 'And?', createdAt: 3 });
  const messages = laterTurn ? [user, answer, later] : [user, answer];
  await repository.saveChatWithMessages(chat, messages);
  const store = createTestStore();
  store.setState((s) => ({
    chats: [chat],
    selectedChatId: chatId,
    loadedMessageChatIds: { [chatId]: true as const },
    ...appendMessagesToChat(s, chatId, messages),
  }));
  const shown = () => store.getState().messagesById[answer.id];
  const stored = async () => (await repository.loadMessages([answer.id]))[0];
  return { store, chatId, answer, shown, stored };
}

test('switching a version in the latest exchange shows it and saves it', async () => {
  const s = await storeSetup();
  s.store.setState((st) => ({
    ui: {
      ...st.ui,
      search: { tavilyByMessageId: { [s.answer.id]: { query: 'q', status: 'done' as const } } },
    },
  }));
  await s.store.getState().showReplyVersion(s.answer.id, 0);
  assert.equal(s.shown()?.content, 'One');
  assert.equal((await s.stored())?.content, 'One');
  assert.equal((await s.stored())?.versionIndex, 0);
  assert.equal(
    s.store.getState().ui.search.tavilyByMessageId?.[s.answer.id],
    undefined,
    'the version shows its own sources, not the last search',
  );
  await s.store.getState().showReplyVersion(s.answer.id, 2);
  assert.equal(s.shown()?.content, 'Three');
  assert.equal((await s.stored())?.versionIndex, undefined);
});

test('an earlier reply keeps its version once the conversation has gone on', async () => {
  const s = await storeSetup({ laterTurn: true });
  await s.store.getState().showReplyVersion(s.answer.id, 0);
  await s.store.getState().deleteReplyVersion(s.answer.id);
  assert.equal(s.shown(), s.answer);
  assert.equal((await s.stored())?.content, 'Three');
});

test('versions stay put while the chat is writing', async () => {
  const s = await storeSetup();
  s.store.setState((st) => ({ ui: adjustActiveTurnCount(st.ui, s.chatId, 1) }));
  await s.store.getState().showReplyVersion(s.answer.id, 0);
  await s.store.getState().deleteReplyVersion(s.answer.id);
  assert.equal(s.shown(), s.answer);
});

test('deleting removes the shown version only; the one before it shows', async () => {
  const s = await storeSetup();
  await s.store.getState().showReplyVersion(s.answer.id, 1);
  await s.store.getState().deleteReplyVersion(s.answer.id);
  assert.equal(s.shown()?.content, 'One');
  assert.equal(versionCount(s.shown()!), 2);
  const stored = await s.stored();
  assert.equal(stored?.content, 'One');
  assert.deepEqual(
    stored?.versions?.map((v) => v.content),
    ['Three'],
  );
  // Down to the last version, which is the reply: it is not deleted here.
  await s.store.getState().deleteReplyVersion(s.answer.id);
  assert.equal(s.shown()?.content, 'Three');
  assert.equal(s.shown()?.versions, undefined);
  await s.store.getState().deleteReplyVersion(s.answer.id);
  assert.equal(s.shown()?.content, 'Three');
  assert.equal((await s.stored())?.content, 'Three');
});

test('branching copies the shown version alone', async () => {
  const s = await storeSetup();
  await s.store.getState().showReplyVersion(s.answer.id, 1);
  await s.store.getState().branchChatFromMessage(s.answer.id);
  const branchId = s.store.getState().selectedChatId!;
  assert.notEqual(branchId, s.chatId);
  const copied = (await repository.loadMessagesForChat(branchId)).find(
    (m) => m.role === 'assistant',
  );
  assert.equal(copied?.content, 'Two');
  assert.equal(copied?.versions, undefined);
  assert.equal(copied?.versionIndex, undefined);
});

// ---- Persistence -------------------------------------------------------------

test('a backup carries every version, and the shown one, through export and import', async () => {
  const source = createRepository(createMemoryDb());
  const chat = makeChat({ id: 'backup-versions' });
  const answer = showVersion(
    addVersion(
      createAssistantMessage({ chatId: chat.id, content: 'One', createdAt: 2, model: 'a/one' }),
      createAssistantMessage({ chatId: chat.id, content: 'Two', createdAt: 2, model: 'b/two' }),
    ),
    0,
  );
  await source.saveChatWithMessages(chat, [answer]);
  const backup = JSON.parse(JSON.stringify(await source.exportAll()));

  const target = createRepository(createMemoryDb());
  await target.importAll(backup);
  const [restored] = await target.loadMessagesForChat(chat.id);
  assert.equal(restored.content, 'One');
  assert.equal(restored.versionIndex, 0);
  assert.equal(restored.versions?.[0]?.content, 'Two');
  assert.equal(restored.versions?.[0]?.model, 'b/two');
});

test('a malformed version or place is dropped; a message without versions is untouched', () => {
  const plain = reply('Plain');
  assert.deepEqual(sanitizeMessageRecord(plain), { next: plain, changed: false });

  const messy = {
    ...reply('Shown'),
    versions: [null, { content: 7 }, { content: 'Kept', attachments: [] }],
    versionIndex: 9,
  } as unknown as Message;
  const { next, changed } = sanitizeMessageRecord(messy);
  assert.equal(changed, true);
  assert.deepEqual(next.versions, [{ content: 'Kept' }]);
  assert.equal(next.versionIndex, undefined);

  const onUser = {
    ...createUserMessage({ chatId: 'c1', content: 'Hi' }),
    versions: [{ content: 'x' }],
  } as Message;
  assert.equal('versions' in sanitizeMessageRecord(onUser).next, false);
});
