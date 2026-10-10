import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { registerSearchProvider } from '@/lib/search/providers/registry';
import { formatSourcesBlock } from '@/lib/search';
import { NOTICE_MISSING_SEARCH_KEY } from '@/lib/store/notices';
import { registerCoreTools } from '@/lib/tools/core/searchTools';
import type { ToolExecutionContext } from '@/lib/tools/execution';
import { getToolHandler } from '@/lib/tools/registry';
import type { Message } from '@/lib/types';
import { err, ok } from '@/lib/utils/result';

const PROVIDER_ID = 'keyless-search';
registerSearchProvider({
  id: PROVIDER_ID,
  label: 'Keyless',
  requiresKey: true,
  search: async () => err(NOTICE_MISSING_SEARCH_KEY, { results: [] }),
});
registerSearchProvider({
  id: 'found-search',
  label: 'Found',
  requiresKey: false,
  search: async () =>
    ok({ results: [{ url: 'https://b.test', title: 'B', description: 'About B' }] }),
});
registerCoreTools();

test('a search without its key says so once', async () => {
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  const notices: unknown[] = [];
  const get = () => ({
    ...store.getState(),
    setNotice: (notice?: string) => notices.push(notice),
  });
  const log = { success: () => undefined, error: () => undefined };
  const handler = getToolHandler('web_search');
  assert.ok(handler);
  await handler({
    toolCall: { id: 'c1', type: 'function', function: { name: 'web_search', arguments: '{}' } },
    parsedArgs: { query: 'solar' },
    aggregatedResults: [],
    context: {
      chatId: 'chat-1',
      assistantMessage: { id: 'reply-1', chatId: 'chat-1', role: 'assistant' } as Message,
      userContent: 'solar',
      searchProvider: PROVIDER_ID,
      controller: new AbortController(),
      set: store.setState,
      get,
      logger: { start: () => log },
    } as unknown as ToolExecutionContext,
  });
  assert.deepEqual(notices, [NOTICE_MISSING_SEARCH_KEY]);
});

test('a search keeps what it found on the reply, earlier results first, so citations survive a reload', async () => {
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  const reply = { id: 'reply-2', chatId: 'chat-2', role: 'assistant', content: '' } as Message;
  store.setState({ messagesById: { [reply.id]: reply } });
  const log = { success: () => undefined, error: () => undefined };
  const handler = getToolHandler('web_search');
  assert.ok(handler);
  await handler({
    toolCall: { id: 'c2', type: 'function', function: { name: 'web_search', arguments: '{}' } },
    parsedArgs: { query: 'b' },
    aggregatedResults: [{ url: 'https://a.test', title: 'A' }],
    context: {
      chatId: reply.chatId,
      assistantMessage: reply,
      userContent: 'b',
      searchProvider: 'found-search',
      controller: new AbortController(),
      set: store.setState,
      get: store.getState,
      logger: { start: () => log },
    } as unknown as ToolExecutionContext,
  });
  const kept = store.getState().messagesById[reply.id]?.searchSources;
  assert.deepEqual(
    kept?.map((source) => source.url),
    ['https://a.test', 'https://b.test'],
  );
  assert.equal(kept?.[1]?.description, 'About B');
});

registerSearchProvider({
  id: 'refused-search',
  label: 'Refused',
  requiresKey: false,
  search: async () => err('The provider did not accept the key.', { results: [] }),
});
registerSearchProvider({
  id: 'empty-search',
  label: 'Empty',
  requiresKey: false,
  search: async () => ok({ results: [] }),
});

async function searchWith(searchProvider: string): Promise<string> {
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  const log = { success: () => undefined, error: () => undefined };
  const handler = getToolHandler('web_search');
  assert.ok(handler);
  const result = await handler({
    toolCall: { id: 'c3', type: 'function', function: { name: 'web_search', arguments: '{}' } },
    parsedArgs: { query: 'q' },
    aggregatedResults: [],
    context: {
      chatId: 'chat-3',
      assistantMessage: { id: 'reply-3', chatId: 'chat-3', role: 'assistant' } as Message,
      userContent: 'q',
      searchProvider,
      controller: new AbortController(),
      set: store.setState,
      get: store.getState,
      logger: { start: () => log },
    } as unknown as ToolExecutionContext,
  });
  const content = result.convoMessages?.[0]?.content;
  assert.equal(typeof content, 'string');
  return content as string;
}

const pages = (site: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    url: `https://${site}${i}.test`,
    title: `${site}${i}`,
  }));
registerSearchProvider({
  id: 'second-search',
  label: 'Second',
  requiresKey: false,
  // Its second page was among the first search's; the rest are new.
  search: async () => ok({ results: [pages('first', 2)[1], ...pages('second', 5)] }),
});

test('a second search is numbered where the reply lists its sources, for the model and the citations alike', async () => {
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  const reply = { id: 'reply-4', chatId: 'chat-4', role: 'assistant', content: '' } as Message;
  store.setState({ messagesById: { [reply.id]: reply } });
  const log = { success: () => undefined, error: () => undefined };
  const handler = getToolHandler('web_search');
  assert.ok(handler);
  const result = await handler({
    toolCall: { id: 'c4', type: 'function', function: { name: 'web_search', arguments: '{}' } },
    parsedArgs: { query: 'second' },
    aggregatedResults: pages('first', 5),
    context: {
      chatId: reply.chatId,
      assistantMessage: reply,
      userContent: 'second',
      searchProvider: 'second-search',
      controller: new AbortController(),
      set: store.setState,
      get: store.getState,
      logger: { start: () => log },
    } as unknown as ToolExecutionContext,
  });
  const told = JSON.parse(String(result.convoMessages?.[0]?.content)) as Array<{
    n: number;
    url: string;
  }>;
  const kept = store.getState().messagesById[reply.id]?.searchSources ?? [];
  assert.equal(kept.length, 10);
  assert.deepEqual(
    told.map((r) => r.n),
    [2, 6, 7, 8, 9, 10],
  );
  for (const { n, url } of told) assert.equal(kept[n - 1]?.url, url, `[${n}] is one page`);
  const block = formatSourcesBlock(result.aggregatedResults ?? [], 'second-search');
  assert.match(block, /^10\. second4 — https:\/\/second4\.test$/m);
});

test('a failed search reaches the model as a failure, not as an empty result', async () => {
  const failed = JSON.parse(await searchWith('refused-search'));
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'The provider did not accept the key.');
  assert.ok(failed.hint);
  assert.deepEqual(JSON.parse(await searchWith('empty-search')), []);
});
