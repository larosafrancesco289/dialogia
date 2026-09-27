import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { registerSearchProvider } from '@/lib/search/providers/registry';
import type { SearchOutcome } from '@/lib/search/providers/types';
import type { SearchResult } from '@/lib/search/types';
import { performWebSearchTool } from '@/lib/search/tool/webSearch';
import { err } from '@/lib/utils/result';

const PROVIDER_ID = 'test-search';
let nextSearch: (signal?: AbortSignal) => Promise<SearchOutcome> = async () =>
  err('unset', { results: [] });
registerSearchProvider({
  id: PROVIDER_ID,
  label: 'Test',
  requiresKey: false,
  search: (_args, ctx) => nextSearch(ctx.signal),
});

const FIRST: SearchResult[] = [
  { title: 'Alpha', url: 'https://alpha.test' },
  { title: 'Beta', url: 'https://beta.test' },
];

function setup() {
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  const messageId = 'reply-1';
  const run = (earlierResults?: SearchResult[], controller = new AbortController()) =>
    performWebSearchTool({
      args: { query: 'second question' },
      fallbackQuery: '',
      searchProvider: PROVIDER_ID,
      controller,
      assistantMessageId: messageId,
      chatId: 'chat-1',
      set: store.setState as never,
      get: store.getState as never,
      earlierResults,
    });
  const entry = () => store.getState().ui.search.tavilyByMessageId?.[messageId];
  return { store, run, entry };
}

test("a failed second search keeps the first one's sources and citations", async () => {
  const s = setup();
  nextSearch = async () => err('Tavily could not run this search.', { results: [] });
  const result = await s.run(FIRST);
  assert.equal(result.ok, false);
  assert.equal(s.entry()?.status, 'done');
  assert.deepEqual(s.entry()?.results, FIRST);
});

test('a search that fails with nothing found before says why', async () => {
  const s = setup();
  nextSearch = async () => err('Tavily could not run this search.', { results: [] });
  await s.run();
  assert.equal(s.entry()?.status, 'error');
  assert.equal(s.entry()?.error, 'Tavily could not run this search.');
});

test('a search the person stopped says Stopped, not the browser abort message', async () => {
  const s = setup();
  const controller = new AbortController();
  nextSearch = async (signal) => {
    controller.abort();
    assert.equal(signal?.aborted, true);
    throw new DOMException('signal is aborted without reason', 'AbortError');
  };
  const result = await s.run(undefined, controller);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Stopped');
  assert.equal(s.entry()?.error, 'Stopped');
});

test('a search that times out says it took too long', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  nextSearch = (signal) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () =>
        reject(new DOMException('signal is aborted without reason', 'AbortError')),
      );
    });
  const pending = s.run();
  t.mock.timers.tick(20000);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error, 'The search took too long.');
  assert.equal(s.entry()?.error, 'The search took too long.');
});
