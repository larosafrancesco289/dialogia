// Deleting a chat in this tab while its reply streams stops the reply, as a
// deletion heard from another tab does, and the reply saves nothing afterwards.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { streamFinal } from '@/lib/agent/streaming';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { buildTransportAuth } from '@/lib/auth/transport';
import { repository } from '@/lib/db';
import { createModelIndex } from '@/lib/models';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat } from '@/lib/messages/indexing';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import type { StreamCallbacks } from '@/lib/transport/types';
import { setTurnController } from '@/lib/turns/runtime';
import { adjustActiveTurnCount } from '@/lib/ui/streaming';
import type { Chat, ModelDescriptor } from '@/lib/types';

const model: ModelDescriptor = {
  id: 'provider/model',
  name: 'Model',
  context_length: 32000,
  pricing: undefined,
  raw: {},
};

test('deleting a chat mid-reply aborts the turn and leaves no message row behind', async () => {
  const chatId = `chat-delete-${Math.random().toString(36).slice(2)}`;
  const chat: Chat = {
    id: chatId,
    title: 'Doomed',
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
  const user = createUserMessage({ chatId, content: 'Hello', createdAt: 10 });
  const assistant = createAssistantMessage({ chatId, content: '', createdAt: 11, model: model.id });
  await repository.saveChat(chat);
  await repository.saveMessages([user, assistant]);
  store.setState((s) => ({
    chats: [chat],
    selectedChatId: chatId,
    models: [model],
    modelIndex: createModelIndex([model]),
    loadedMessageChatIds: { [chatId]: true as const },
    ...appendMessagesToChat(s, chatId, [user, assistant]),
    ui: adjustActiveTurnCount(s.ui, chatId, 1),
  }));

  const controller = new AbortController();
  setTurnController(chatId, controller);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let streamStarted!: () => void;
  const started = new Promise<void>((resolve) => (streamStarted = resolve));
  const pipeline = createPipelineClient({
    // A provider that ignores the abort, as a response already under way may.
    streamChatCompletion: async (params) => {
      const callbacks = params.callbacks as StreamCallbacks;
      callbacks.onToken?.('Some ');
      streamStarted();
      await gate;
      callbacks.onToken?.('late words');
      await callbacks.onDone?.('Some late words', { finishReason: 'stop' });
    },
  });

  const settings = resolveTurnSettings({
    chat,
    ui: store.getState().ui,
    modelIndex: store.getState().modelIndex,
    modelId: model.id,
  });
  const turn = streamFinal({
    chat,
    chatId,
    assistantMessage: assistant,
    messages: [{ role: 'user', content: 'Hello' }],
    controller,
    turn: {
      auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test-key' }),
      set: store.setState,
      get: store.getState,
      models: [model],
      modelIndex: store.getState().modelIndex,
      persistMessage: createMessagePersister(repository),
    },
    settings,
    startBuffered: false,
    pipeline,
  });

  await started;
  await store.getState().deleteChat(chatId);
  assert.equal(controller.signal.aborted, true, 'the turn is aborted');
  assert.equal(store.getState().ui.activeTurnByChatId[chatId], undefined);

  release();
  await turn;
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(await repository.loadMessagesForChat(chatId), []);
  assert.equal(store.getState().messagesById[assistant.id], undefined);
});
