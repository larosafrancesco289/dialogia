import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import type { Message } from '@/lib/types';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { buildAnthropicError } from '@/lib/anthropic/errors';
import { NOTICE_INVALID_KEY, NOTICE_RATE_LIMITED } from '@/lib/store/notices';

function harness() {
  const notices: unknown[] = [];
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
    setNotice: (notice?: string) => notices.push(notice),
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
  return { callbacks, persisted, stored, notices };
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

test("a later stream's citations join the reply's, not replace them", () => {
  const { callbacks, stored } = harness();
  const cite = (url: string) => ({ type: 'url_citation', url_citation: { url } });
  callbacks.onAnnotations?.([cite('https://a.test')]);
  callbacks.beginRound();
  callbacks.onAnnotations?.([cite('https://b.test')]);
  assert.deepEqual(stored()?.annotations, [cite('https://a.test'), cite('https://b.test')]);
  // Each stream reports its own whole set, which may repeat what came before.
  callbacks.onAnnotations?.([cite('https://b.test'), cite('https://a.test')]);
  assert.deepEqual(stored()?.annotations, [cite('https://a.test'), cite('https://b.test')]);
});

test('a key refused mid-stream shows the same notice as one refused up front', async () => {
  const refused = (status: number, code: string) =>
    buildAnthropicError(
      new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status }),
      code,
      status === 401 ? 'Invalid API key' : 'Rate limited',
    );
  const unauthorized = harness();
  unauthorized.callbacks.onError?.(await refused(401, API_ERROR_CODES.UNAUTHORIZED));
  assert.deepEqual(unauthorized.notices, [NOTICE_INVALID_KEY]);
  const limited = harness();
  limited.callbacks.onError?.(await refused(429, API_ERROR_CODES.RATE_LIMITED));
  assert.deepEqual(limited.notices, [NOTICE_RATE_LIMITED]);
});
