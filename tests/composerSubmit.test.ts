import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitComposer } from '@/lib/hooks/useComposerShortcuts';

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
