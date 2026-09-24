// The final save of a reply is awaited end to end: a save that fails says so
// and still lets the turn clean up, and a transport resolves only after it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat } from '@/lib/messages/indexing';
import { NOTICE_SAVE_FAILED } from '@/lib/store/notices';
import { streamChatCompletion as streamOpenRouter } from '@/lib/openrouter/stream';
import { streamChatCompletion as streamAnthropic } from '@/lib/anthropic/stream';
import { buildTransportAuth } from '@/lib/auth/transport';
import { ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { createTestStoreState } from './helpers/createTestStoreState';
import { mockFetch } from './helpers/mockFetch';

test('a final save that fails shows a notice and still clears the turn', async () => {
  const assistant = createAssistantMessage({ chatId: 'c1', content: '', createdAt: 1 });
  const { state, set, get } = createTestStoreState();
  Object.assign(state, appendMessagesToChat(state, 'c1', [assistant]));
  let cleared = false;
  const callbacks = createMessageStreamCallbacks(
    {
      chatId: 'c1',
      assistantMessage: assistant,
      set,
      get,
      clearController: () => {
        cleared = true;
      },
      persistMessage: async () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    },
    { startedAt: 0 },
  );
  callbacks.onToken?.('A whole answer.');
  await callbacks.onDone?.('A whole answer.', { finishReason: 'stop' });
  assert.equal(state.ui.notice, NOTICE_SAVE_FAILED);
  assert.equal(cleared, true);
  assert.equal(state.messagesById[assistant.id]?.content, 'A whole answer.');
});

const sse = (lines: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines.join('\n\n') + '\n\n'));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );

/** Runs a stream whose onDone takes a while, and records what finished first. */
async function orderOf(run: (onDone: () => Promise<void>) => Promise<void>) {
  const order: string[] = [];
  await run(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push('onDone settled');
  });
  order.push('stream resolved');
  return order;
}

test('the OpenRouter stream resolves only after onDone has settled', async () => {
  const restore = mockFetch(async () =>
    sse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hi' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}`,
      'data: [DONE]',
    ]),
  );
  try {
    const order = await orderOf((onDone) =>
      streamOpenRouter({
        auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'k' }),
        model: 'provider/model',
        messages: [{ role: 'user', content: 'Hello' }],
        callbacks: { onDone },
      }),
    );
    assert.deepEqual(order, ['onDone settled', 'stream resolved']);
  } finally {
    restore();
  }
});

test('the Anthropic stream resolves only after onDone has settled', async () => {
  const event = (payload: Record<string, unknown>) =>
    `event: ${String(payload.type)}\ndata: ${JSON.stringify(payload)}`;
  const restore = mockFetch(async () =>
    sse([
      event({
        type: 'message_start',
        message: { id: 'm', role: 'assistant', content: [], usage: { input_tokens: 1 } },
      }),
      event({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } }),
      event({ type: 'content_block_stop', index: 0 }),
      event({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} }),
      event({ type: 'message_stop' }),
    ]),
  );
  try {
    const order = await orderOf((onDone) =>
      streamAnthropic({
        auth: buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'k' }),
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        callbacks: { onDone },
      }),
    );
    assert.deepEqual(order, ['onDone settled', 'stream resolved']);
  } finally {
    restore();
  }
});
