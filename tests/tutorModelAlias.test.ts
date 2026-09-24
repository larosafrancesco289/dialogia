import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Repository } from '@/lib/db/repository';
import { createModelIndex } from '@/lib/models';
import { prepareSendRuntime } from '@/lib/turns/runtime';
import { createTestStoreState } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';

const tutorChat = () =>
  makeChat({
    title: 'Probability',
    settings: { modelId: 'openai/gpt-6-luna', features: { tutor: { enabled: true } } },
  });

const model = (id: string) => ({
  id,
  name: id,
  context_length: 100000,
  pricing: { prompt: 1, completion: 1, currency: 'usd' },
});

test('a tutor default given as a dynamic alias runs on the model it resolves to', async () => {
  // The first model in the catalogue is an unrelated one: the old fallback
  // for "not in the catalogue" picked it.
  const models = [model('aion-labs/aion-3.5-mini'), model('anthropic/claude-fable-5.1')];
  const { state, set, get } = createTestStoreState({
    chats: [tutorChat()],
    selectedChatId: 'chat-1',
    models: models as never,
    modelIndex: createModelIndex(models as never),
    ui: {
      flags: { experimentalTutor: true },
      tutor: { defaultModelId: '~anthropic/frontier' },
    },
  });

  await prepareSendRuntime({
    set,
    get,
    repository: { saveChat: async () => {} } as unknown as Repository,
  });

  const chat = state.chats[0];
  assert.equal(chat.settings.modelId, 'anthropic/claude-fable-5.1');
  assert.equal(chat.settings.features.tutor?.defaultModelId, 'anthropic/claude-fable-5.1');
});
