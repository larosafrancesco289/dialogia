// A tutor chat's greeting is written by its first send, ahead of the learner's
// message, and is in that first request: the model sees what the learner saw.

import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '@/lib/db';
import { deleteKey, setKey } from '@/lib/keys/store';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { loadModuleRuntimes } from '@/lib/modules';
import { createModelIndex } from '@/lib/models';
import { sendUserTurn } from '@/lib/services/turns';
import { OPENROUTER_KEY_REF } from '@/lib/transport/endpoints';
import type { ModelDescriptor } from '@/lib/types';
import { createTestStore } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';
import { mockFetch } from './helpers/mockFetch';

before(async () => {
  await loadModuleRuntimes();
});

const model: ModelDescriptor = {
  id: 'provider/tutor-model',
  name: 'Tutor Model',
  context_length: 32000,
  pricing: undefined,
  raw: { supported_parameters: ['tools'] },
};

test('an unsent tutor chat stays empty; the first send writes the greeting before the message', async () => {
  const chat = makeChat({
    id: `chat-greeting-${Math.random().toString(36).slice(2)}`,
    settings: {
      modelId: model.id,
      features: { tutor: { enabled: true, defaultModelId: model.id } },
    },
  });
  const store = createTestStore();
  store.setState((s) => ({
    chats: [chat],
    models: [model],
    modelIndex: createModelIndex([model]),
    loadedMessageChatIds: { [chat.id]: true as const },
    ui: {
      ...s.ui,
      zdrOnly: false,
      flags: { ...s.ui.flags, experimentalTutor: true },
      tutor: { ...s.ui.tutor, defaultModelId: model.id },
    },
  }));
  store.getState().selectChat(chat.id);
  assert.equal(getMessagesForChat(store.getState(), chat.id).length, 0);

  await setKey(OPENROUTER_KEY_REF, 'test-key');
  const requests: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
  const restore = mockFetch(async (_url, init) => {
    if (typeof init?.body === 'string') requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ error: { message: 'Bad request', code: 400 } }), {
      status: 400,
    });
  });
  try {
    await sendUserTurn({
      content: 'I want to learn how vaccines work',
      set: store.setState,
      get: store.getState,
      repository,
    });
  } finally {
    restore();
    await deleteKey(OPENROUTER_KEY_REF);
  }

  const [greeting, question] = getMessagesForChat(store.getState(), chat.id);
  assert.equal(greeting?.tutorWelcome, true);
  assert.equal(question?.role, 'user');
  assert.ok(greeting.createdAt < question.createdAt);

  const sent = requests.find((body) => Array.isArray(body.messages));
  assert.ok(sent, 'the turn sent a request');
  const turns = sent.messages.filter((m) => m.role !== 'system');
  assert.equal(turns[0]?.role, 'assistant');
  assert.ok(JSON.stringify(turns[0]?.content).includes(greeting.content));
  assert.equal(turns[1]?.role, 'user');
});
