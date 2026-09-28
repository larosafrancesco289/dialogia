import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { registerSearchProvider } from '@/lib/search/providers/registry';
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
