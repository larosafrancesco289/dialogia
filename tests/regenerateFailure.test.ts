// A regenerate that fails before the new reply shows anything must leave the
// original reply where it was, in the store and on disk, whichever transport
// the failure came through.

import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { regenerate } from '@/lib/agent/regenerate';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { buildTransportAuth } from '@/lib/auth/transport';
import { loadModuleRuntimes } from '@/lib/modules';
import { createModelIndex } from '@/lib/models';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import type { ProviderEndpoint } from '@/lib/transport/endpoints';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import { mockFetch } from './helpers/mockFetch';

before(async () => {
  await loadModuleRuntimes();
});

// `tools` offers the model memory's tools, so the turn runs the tool loop as most chats do.
function setup(
  endpoint: ProviderEndpoint,
  modelId: string,
  { original: shown = {}, tools = false }: { original?: Partial<Message>; tools?: boolean } = {},
) {
  const model: ModelDescriptor = {
    id: modelId,
    name: 'Model',
    context_length: 32000,
    pricing: undefined,
    raw: tools ? { supported_parameters: ['tools'] } : {},
  };
  const chatId = `chat-regen-${Math.random().toString(36).slice(2)}`;
  const chat: Chat = {
    id: chatId,
    title: 'Regenerate',
    createdAt: 1,
    updatedAt: 1,
    settings: {
      modelId,
      system: 'You are helpful.',
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: { search: { enabled: false, provider: 'openrouter' }, tutor: { enabled: false } },
    },
  };
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  const user = createUserMessage({ chatId, content: 'Question?', createdAt: 10 });
  const original: Message = {
    ...createAssistantMessage({
      chatId,
      content: 'Original answer',
      createdAt: 11,
      model: modelId,
    }),
    ...shown,
  };
  store.setState((s) => ({
    chats: [chat],
    selectedChatId: chatId,
    models: [model],
    modelIndex: createModelIndex([model]),
    ...appendMessagesToChat(s, chatId, [user, original]),
    ...(tools ? { memory: { ...s.memory, loaded: true } } : {}),
  }));
  const persisted: Message[] = [];
  const run = (pipeline?: PipelineClient, controller = new AbortController()) =>
    regenerate({
      chat,
      chatId,
      targetMessageId: original.id,
      messages: getMessagesForChat(store.getState(), chatId),
      turn: {
        auth: buildTransportAuth({ endpoint, apiKey: 'test-key' }),
        set: store.setState,
        get: store.getState,
        models: [model],
        modelIndex: store.getState().modelIndex,
        persistMessage: async (message) => {
          persisted.push(message);
        },
      },
      controller,
      pipeline,
    });
  return { store, original, persisted, run };
}

const httpError = (status: number) =>
  mockFetch(
    async () =>
      new Response(JSON.stringify({ error: { type: 'error', message: `status ${status}` } }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('OpenRouter: a regenerate rejected before streaming keeps the original reply', async () => {
  const s = setup(OPENROUTER_ENDPOINT, 'provider/model');
  const restore = httpError(401);
  try {
    await assert.rejects(s.run());
  } finally {
    restore();
  }
  await flush();
  assert.equal(s.store.getState().messagesById[s.original.id]?.content, 'Original answer');
  assert.deepEqual(
    s.persisted.filter((m) => m.id === s.original.id),
    [],
  );
  assert.equal(s.store.getState().ui.activeTurnByChatId[s.original.chatId], undefined);
});

for (const status of [401, 429, 529]) {
  test(`Anthropic: a regenerate failing with HTTP ${status} keeps the original reply`, async () => {
    const s = setup(ANTHROPIC_ENDPOINT, 'claude-sonnet-4-6');
    const restore = httpError(status);
    try {
      await assert.rejects(s.run());
    } finally {
      restore();
    }
    await flush();
    assert.equal(s.store.getState().messagesById[s.original.id]?.content, 'Original answer');
    assert.deepEqual(
      s.persisted.filter((m) => m.id === s.original.id),
      [],
      'the empty replacement must not be written over the original',
    );
  });
}

test('a regenerate stopped before its first token keeps the original reply', async () => {
  const s = setup(ANTHROPIC_ENDPOINT, 'claude-sonnet-4-6');
  const controller = new AbortController();
  const pipeline = createPipelineClient({
    streamChatCompletion: async (params) => {
      controller.abort();
      const error = new DOMException('The operation was aborted.', 'AbortError');
      params.callbacks?.onError?.(error as unknown as Error);
      throw error;
    },
  });
  await assert.rejects(s.run(pipeline, controller));
  await flush();
  assert.equal(s.store.getState().messagesById[s.original.id]?.content, 'Original answer');
  assert.deepEqual(
    s.persisted.filter((m) => m.id === s.original.id),
    [],
  );
});

test('a regenerate that fails after streaming keeps what streamed, marked failed', async () => {
  const s = setup(ANTHROPIC_ENDPOINT, 'claude-sonnet-4-6');
  const pipeline = createPipelineClient({
    streamChatCompletion: async (params) => {
      params.callbacks?.onToken?.('Partial new answer');
      const error = new Error('connection reset');
      params.callbacks?.onError?.(error);
      throw error;
    },
  });
  await assert.rejects(s.run(pipeline));
  await flush();
  const current = s.store.getState().messagesById[s.original.id];
  assert.equal(current?.content, 'Partial new answer');
  assert.equal(current?.cutOff, 'failed');
  const writes = s.persisted.filter((m) => m.id === s.original.id);
  assert.equal(writes.at(-1)?.content, 'Partial new answer');
  assert.equal(writes.at(-1)?.cutOff, 'failed');
});

const throwsBeforeStreaming = () =>
  createPipelineClient({
    streamChatCompletion: async () => {
      throw new Error('refused');
    },
  });

test('a regenerate refused in the tool loop saves no empty copy over the original', async () => {
  const s = setup(ANTHROPIC_ENDPOINT, 'claude-sonnet-4-6', { tools: true });
  await assert.rejects(s.run(throwsBeforeStreaming()));
  await flush();
  assert.equal(s.store.getState().messagesById[s.original.id]?.content, 'Original answer');
  assert.deepEqual(
    s.persisted.filter((m) => m.id === s.original.id),
    [],
  );
});

for (const tools of [false, true]) {
  test(`a failed Try again of a failed reply stays marked failed (tool loop: ${tools})`, async () => {
    const s = setup(ANTHROPIC_ENDPOINT, 'claude-sonnet-4-6', {
      original: { content: '', cutOff: 'failed' },
      tools,
    });
    await assert.rejects(s.run(throwsBeforeStreaming()));
    await flush();
    assert.equal(s.store.getState().messagesById[s.original.id]?.cutOff, 'failed');
    const writes = s.persisted.filter((m) => m.id === s.original.id);
    assert.ok(writes.length > 0, 'the attempt replaces the failed reply on disk');
    assert.ok(
      writes.every((m) => m.cutOff),
      'no unmarked empty copy is ever written',
    );
    assert.equal(writes.at(-1)?.cutOff, 'failed');
  });
}

test('a failed rerun of an empty placeholder says it failed', async () => {
  const s = setup(ANTHROPIC_ENDPOINT, 'claude-sonnet-4-6', { original: { content: '' } });
  await assert.rejects(s.run(throwsBeforeStreaming()));
  await flush();
  assert.equal(s.store.getState().messagesById[s.original.id]?.cutOff, 'failed');
  assert.equal(s.persisted.filter((m) => m.id === s.original.id).at(-1)?.cutOff, 'failed');
});
