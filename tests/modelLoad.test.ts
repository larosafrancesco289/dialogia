import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetEndpointRegistryForTest } from '@/lib/transport/endpointRegistry';
import { mockFetch } from './helpers/mockFetch';
import { createTestStore } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';

const modelList = (...ids: string[]) =>
  new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 });

test('a load asked for while one runs runs again after it, and sees what changed', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'First',
    baseUrl: 'http://localhost:4001/v1',
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let asked!: () => void;
  const firstAsked = new Promise<void>((resolve) => (asked = resolve));
  const restore = mockFetch((async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(':4001')) {
      asked();
      await held;
      return modelList('first-model');
    }
    return modelList('second-model');
  }) as never);
  try {
    const first = store.getState().loadModels();
    await firstAsked;
    // Added while the first load waits on its server.
    store.getState().addEndpoint({
      kind: 'openai-compatible',
      label: 'Second',
      baseUrl: 'http://localhost:4002/v1',
    });
    const second = store.getState().loadModels();
    release();
    await Promise.all([first, second]);
  } finally {
    restore();
  }
  assert.deepEqual(
    store
      .getState()
      .models.map((model) => model.id)
      .sort(),
    ['endpoint:first/first-model', 'endpoint:second/second-model'],
  );
  resetEndpointRegistryForTest();
});

test('an empty chat whose model nobody serves takes the default once models load', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Mock',
    baseUrl: 'http://localhost:4003/v1',
  });
  const empty = makeChat({ id: 'empty', settings: { modelId: 'openai/gpt-6-luna' } });
  store.setState({
    chats: [empty],
    selectedChatId: empty.id,
    loadedMessageChatIds: { [empty.id]: true },
  });
  const restore = mockFetch((async () => modelList('mock-fast')) as never);
  try {
    await store.getState().loadModels();
  } finally {
    restore();
  }
  const state = store.getState();
  assert.equal(state.chats[0].settings.modelId, 'endpoint:mock/mock-fast');
  // Not the reader's choice, so new chats are not held to it.
  assert.equal(state.ui.chatDefaults?.modelId, undefined);
  resetEndpointRegistryForTest();
});

test('a chat with something said in it keeps its model', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Mock',
    baseUrl: 'http://localhost:4004/v1',
  });
  const used = makeChat({ id: 'used', settings: { modelId: 'openai/gpt-6-luna' } });
  store.setState({
    chats: [used],
    selectedChatId: used.id,
    loadedMessageChatIds: { [used.id]: true },
    nonEmptyChatIds: { [used.id]: true },
  });
  const restore = mockFetch((async () => modelList('mock-fast')) as never);
  try {
    await store.getState().loadModels();
  } finally {
    restore();
  }
  assert.equal(store.getState().chats[0].settings.modelId, 'openai/gpt-6-luna');
  resetEndpointRegistryForTest();
});
