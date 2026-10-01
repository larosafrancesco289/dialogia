import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitComposer } from '@/lib/hooks/useComposerShortcuts';
import { createModelIndex } from '@/lib/models';
import { canSendWithModel } from '@/lib/services/auth';
import { resetEndpointRegistryForTest } from '@/lib/transport/endpointRegistry';
import { createTestStore } from './helpers/createTestStoreState';

function harness(canSend: boolean) {
  const calls: string[] = [];
  const options = {
    chat: undefined,
    models: [],
    nextOverrides: {},
    updateChatSettings: async () => {},
    setUI: () => {},
    setNotice: () => {},
    newChat: async () => {
      calls.push('newChat');
    },
    sendMessage: async () => {
      calls.push('send');
    },
    canSend: () => canSend,
  };
  const args = {
    text: 'Hello there',
    attachments: [],
    onBeforeSend: () => calls.push('clearDraft'),
    onAfterSend: () => calls.push('afterSend'),
  };
  return { calls, options, args };
}

test('a send that cannot go out keeps the draft and opens no chat', async () => {
  const { calls, options, args } = harness(false);
  assert.equal(await submitComposer(options, args), 'blocked');
  assert.deepEqual(calls, []);
});

test('a send that can go out opens a chat, clears the draft, then sends', async () => {
  const { calls, options, args } = harness(true);
  assert.equal(await submitComposer(options, args), 'sent');
  assert.deepEqual(calls, ['newChat', 'clearDraft', 'send', 'afterSend']);
});

test('a slash command runs even when a message could not go out', async () => {
  const { calls, options } = harness(false);
  let accepted = false;
  const result = await submitComposer(options, {
    text: '/help',
    attachments: [],
    onCommandHandled: () => {
      accepted = true;
    },
  });
  assert.equal(result, 'command');
  assert.equal(accepted, true);
  assert.deepEqual(calls, []);
});

test('a send zero data retention refuses keeps the draft, and names the model in one line', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Mock',
    baseUrl: 'http://localhost:9999/v1',
    modelIds: ['mock-think'],
  });
  const models = [{ id: 'endpoint:mock/mock-think', name: 'Mock Think' }];
  store.setState((s) => ({
    models,
    modelIndex: createModelIndex(models),
    ui: { ...s.ui, zdrOnly: true },
    zdrModelIds: ['openai/gpt-4o'],
    zdrProviderIds: ['openai'],
    zdrFetchedAt: Date.now(),
  }));
  const canSend = () =>
    canSendWithModel('endpoint:mock/mock-think', store.setState, store.getState);

  const { calls, options, args } = harness(false);
  assert.equal(await submitComposer({ ...options, canSend }, args), 'blocked');
  assert.deepEqual(calls, [], 'the draft stays in the composer');
  assert.equal(
    store.getState().ui.notice,
    'Mock Think does not promise zero data retention. Pick another model, or turn off Zero data retention only in Settings › Models.',
  );

  store.setState((s) => ({ ui: { ...s.ui, zdrOnly: false } }));
  assert.equal(canSend(), true);
  resetEndpointRegistryForTest();
});
