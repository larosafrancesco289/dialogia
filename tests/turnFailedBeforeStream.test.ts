// A reply whose request fails before its stream starts (the provider refuses
// it outright) must end marked as failed, in the store and on disk, so it does
// not sit there as an empty block once the toast is gone, or after a reload.

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
import type { Chat, ModelDescriptor } from '@/lib/types';
import { mockFetch } from './helpers/mockFetch';

const model: ModelDescriptor = {
  id: 'provider/model',
  name: 'Model',
  context_length: 32000,
  pricing: undefined,
  raw: {},
};

test('a reply refused before its first token is marked failed and saved that way', async () => {
  const chatId = `chat-failed-${Math.random().toString(36).slice(2)}`;
  const chat: Chat = {
    id: chatId,
    title: 'Failing',
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
  const restore = mockFetch(
    async () =>
      new Response(JSON.stringify({ error: { message: 'Bad request', code: 400 } }), {
        status: 400,
      }),
  );
  try {
    const spawned = await spawnTurnMessages({
      chatId,
      content: 'Hello',
      primaryAttachments: [],
      activeModelIds: [model.id],
      set,
      get,
      repository,
    });
    assert.ok(spawned);
    const reply = spawned.assistantByModel.get(model.id);
    assert.ok(reply);
    // Until it has an ending, the reply on disk reads as one the page closed on;
    // on screen it is simply under way.
    const [placeholder] = await repository.loadMessages([reply.id]);
    assert.equal(placeholder?.cutOff, 'interrupted');
    assert.equal(get().messagesById[reply.id]?.cutOff, undefined);
    await executeModelTurn({
      modelId: model.id,
      isPrimary: true,
      assistantMessage: reply,
      attachments: [],
      runtime: {
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
      },
      content: 'Hello',
      priorMessages: [],
      masterController: spawned.masterController,
      markComplete: spawned.markComplete,
      set,
      get,
      getCurrentChat: () => chat,
      updateChat: () => undefined,
      repository,
    });

    assert.equal(get().messagesById[reply.id]?.content, '');
    assert.equal(get().messagesById[reply.id]?.cutOff, 'failed');
    const [saved] = await repository.loadMessages([reply.id]);
    assert.equal(saved?.cutOff, 'failed');
  } finally {
    restore();
  }
});
