// The per-chat streaming count is each turn's own: a turn stopped before it
// reached the network, which only fails later, must not zero the count of a
// turn started after the Stop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { buildTransportAuth } from '@/lib/auth/transport';
import { repository } from '@/lib/db';
import { createModelIndex } from '@/lib/models';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { executeModelTurn } from '@/lib/services/turns/executor';
import { spawnTurnMessages } from '@/lib/services/turns/spawn';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { getActiveTurnCount } from '@/lib/ui/streaming';
import type { TurnRuntimeContext } from '@/lib/turns/runtime';
import type { Chat, ModelDescriptor } from '@/lib/types';
import { mockFetch } from './helpers/mockFetch';

const model: ModelDescriptor = {
  id: 'provider/model',
  name: 'Model',
  context_length: 32000,
  pricing: undefined,
  raw: {},
};

function setup() {
  const chatId = `chat-count-${Math.random().toString(36).slice(2)}`;
  const chat: Chat = {
    id: chatId,
    title: 'Counting',
    createdAt: 1,
    updatedAt: 1,
    settings: {
      modelId: model.id,
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
  store.setState({
    chats: [chat],
    selectedChatId: chatId,
    models: [model],
    modelIndex: createModelIndex([model]),
    loadedMessageChatIds: { [chatId]: true as const },
  });
  const { setState: set, getState: get } = store;
  const spawn = (content: string) =>
    spawnTurnMessages({
      chatId,
      content,
      primaryAttachments: [],
      activeModelIds: [model.id],
      set,
      get,
      repository,
    });
  const runtime = (): TurnRuntimeContext => ({
    chatId,
    chat,
    ui: get().ui,
    next: {},
    tutorEnabled: false,
    activeModelIds: [model.id],
    primaryModelId: model.id,
    priorMessages: [],
    baseTurnContext: {
      set,
      get,
      models: [model],
      modelIndex: get().modelIndex,
      persistMessage: createMessagePersister(repository),
    },
    modelContexts: new Map([
      [
        model.id,
        {
          modelId: model.id,
          auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test-key' }),
          caps: { canReason: false, canSee: false, canAudio: false, canImageOut: false },
          attachments: [],
        },
      ],
    ]),
  });
  const run = (spawned: NonNullable<Awaited<ReturnType<typeof spawn>>>, content: string) =>
    executeModelTurn({
      modelId: model.id,
      isPrimary: true,
      assistantMessage: spawned.assistantByModel.get(model.id),
      attachments: [],
      runtime: runtime(),
      content,
      priorMessages: [],
      masterController: spawned.masterController,
      markComplete: spawned.markComplete,
      set,
      get,
      getCurrentChat: () => chat,
      updateChat: () => undefined,
      repository,
    });
  return { chatId, store, spawn, run, count: () => getActiveTurnCount(get().ui, chatId) };
}

/** A request that stays unanswered until released, then fails as an aborted one would. */
function stalledThenAborted() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const restore = mockFetch(async () => {
    await gate;
    throw new DOMException('The operation was aborted.', 'AbortError');
  });
  return { release, restore };
}

test("a stopped turn that fails later leaves the next turn's count alone", async () => {
  const s = setup();
  const net = stalledThenAborted();
  try {
    const a = await s.spawn('first');
    assert.ok(a);
    const turnA = s.run(a, 'first');
    await new Promise((resolve) => setTimeout(resolve, 5));

    s.store.getState().stopStreaming();
    const b = await s.spawn('second');
    assert.ok(b);

    net.release();
    await turnA;
    assert.equal(s.count(), 1, 'the second turn is still streaming');

    b.markComplete();
    assert.equal(s.count(), 0);
  } finally {
    net.restore();
  }
});

test('a Stop leaves the chat not streaming once its turn has ended', async () => {
  const s = setup();
  const net = stalledThenAborted();
  try {
    const a = await s.spawn('only');
    assert.ok(a);
    const turnA = s.run(a, 'only');
    await new Promise((resolve) => setTimeout(resolve, 5));
    s.store.getState().stopStreaming();
    net.release();
    await turnA;
    assert.equal(s.count(), 0);
  } finally {
    net.restore();
  }
});
