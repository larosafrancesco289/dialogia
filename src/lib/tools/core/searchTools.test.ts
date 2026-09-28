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
import { err } from '@/lib/utils/result';

const PROVIDER_ID = 'keyless-search';
registerSearchProvider({
  id: PROVIDER_ID,
  label: 'Keyless',
  requiresKey: true,
  search: async () => err(NOTICE_MISSING_SEARCH_KEY, { results: [] }),
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
