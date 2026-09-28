import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import type { Message } from '@/lib/types';

function harness() {
  const assistant = {
    id: 'a1',
    chatId: 'c1',
    role: 'assistant',
    content: '',
    createdAt: 1,
  } as Message;
  let state: Record<string, unknown> = {
    messagesById: { a1: assistant },
    messageIdsByChatId: { c1: ['a1'] },
    ui: {},
    chats: [{ id: 'c1', settings: {} }],
    setNotice: () => undefined,
  };
  const persisted: Message[] = [];
  const set = (update: unknown) => {
    const partial = typeof update === 'function' ? update(state) : update;
    state = { ...state, ...(partial as object) };
  };
  const get = () => state;
  const callbacks = createMessageStreamCallbacks(
    {
      chatId: 'c1',
      assistantMessage: assistant,
      set: set as never,
      get: get as never,
      persistMessage: async (message) => {
        persisted.push(message);
      },
    },
    { startedAt: 0 },
  );
  const stored = () => (state.messagesById as Record<string, Message>).a1;
  return { callbacks, persisted, stored };
}

test('a reply the person stops is marked stopped, in the store and on disk', () => {
  const { callbacks, persisted, stored } = harness();
  callbacks.onToken?.('Half an answer');
  callbacks.onError?.(new DOMException('The user aborted a request.', 'AbortError'));
  assert.equal(stored()?.cutOff, 'stopped');
  assert.equal(persisted.at(-1)?.cutOff, 'stopped');
});

test('a reply a failure ends is marked failed', () => {
  const { callbacks, persisted } = harness();
  callbacks.onToken?.('Half an answer');
  callbacks.onError?.(new Error('Network error'));
  assert.equal(persisted.at(-1)?.cutOff, 'failed');
});

test('a finished reply carries no cut-off mark', async () => {
  const { callbacks, persisted } = harness();
  callbacks.onToken?.('A whole answer.');
  await callbacks.onDone?.('A whole answer.', { finishReason: 'stop' });
  assert.equal(persisted.at(-1)?.cutOff, undefined);
  assert.equal(persisted.at(-1)?.finishReason, 'stop');
});

test('a finished reply is stored without the tool JSON a model echoed ahead of it', async () => {
  const { callbacks, persisted, stored } = harness();
  const full = '{"tool":"call","args":{"q":"x"}}\nThe answer.';
  callbacks.onToken?.(full);
  await callbacks.onDone?.(full, { finishReason: 'stop' });
  assert.equal(stored()?.content, 'The answer.');
  assert.equal(persisted.at(-1)?.content, 'The answer.');
});

test('thinking is timed from the request, so a model that thinks silently first shows it', async () => {
  const realNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const { callbacks, stored } = harness();
    // Three silent seconds before the first thought is streamed, one more after it.
    now = 4_000;
    callbacks.onReasoningToken?.('Weighing it up.');
    now = 5_000;
    callbacks.onToken?.('The answer.');
    await callbacks.onDone?.('The answer.', { finishReason: 'stop' });
    const thought = stored()?.activity?.find((item) => item.type === 'reasoning');
    assert.equal(thought?.type === 'reasoning' ? thought.duration : undefined, 4_000);
  } finally {
    Date.now = realNow;
  }
});
