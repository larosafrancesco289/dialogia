// Thinking that comes in separate pieces (blocks before and after a tool call
// or a native search, or rounds of one reply) reads as separate paragraphs,
// never as "…this time.The results…".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStreamEvent, createStreamTurn } from '@/lib/anthropic/streamEvents';
import { streamChatCompletion as streamOpenRouter } from '@/lib/openrouter/stream';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat } from '@/lib/messages/indexing';
import { buildTransportAuth } from '@/lib/auth/transport';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { createTestStoreState } from './helpers/createTestStoreState';
import { mockFetch } from './helpers/mockFetch';

test('Anthropic: a thinking block after a server-side search starts a new paragraph', () => {
  const turn = createStreamTurn();
  const reasoning: string[] = [];
  const emit = { onReasoningToken: (delta: string) => reasoning.push(delta) };
  const events = [
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'I should search this time.' },
    },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 's1' } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: {} },
    },
    { type: 'content_block_stop', index: 1 },
    {
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [] },
    },
    { type: 'content_block_stop', index: 2 },
    { type: 'content_block_start', index: 3, content_block: { type: 'thinking', thinking: '' } },
    {
      type: 'content_block_delta',
      index: 3,
      delta: { type: 'thinking_delta', thinking: 'The results ' },
    },
    {
      type: 'content_block_delta',
      index: 3,
      delta: { type: 'thinking_delta', thinking: 'agree.' },
    },
    { type: 'content_block_delta', index: 3, delta: { type: 'signature_delta', signature: 's2' } },
    { type: 'content_block_stop', index: 3 },
  ];
  for (const event of events) applyStreamEvent(turn, event, emit);

  assert.equal(reasoning.join(''), 'I should search this time.\n\nThe results agree.');
  // What is sent back to the API is each block's own text, signed as it came.
  assert.deepEqual(
    turn.thinkingBlocks.map((block) => block.thinking),
    ['I should search this time.', 'The results agree.'],
  );
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

const reasoningChunk = (text: string, index: number) =>
  `data: ${JSON.stringify({
    choices: [
      {
        delta: {
          reasoning: text,
          reasoning_details: [
            { type: 'reasoning.text', text, format: 'anthropic-claude-v1', index },
          ],
        },
      },
    ],
  })}`;

test('OpenRouter: a new reasoning_details index starts a new paragraph', async () => {
  const restore = mockFetch(async () =>
    sse([
      reasoningChunk('I should search ', 0),
      reasoningChunk('this time.', 0),
      reasoningChunk('The results ', 1),
      reasoningChunk('agree.', 1),
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Answer.' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}`,
      'data: [DONE]',
    ]),
  );
  const reasoning: string[] = [];
  try {
    await streamOpenRouter({
      auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'k' }),
      model: 'anthropic/claude-opus',
      messages: [{ role: 'user', content: 'Hello' }],
      callbacks: { onReasoningToken: (delta) => reasoning.push(delta) },
    });
  } finally {
    restore();
  }
  assert.equal(reasoning.join(''), 'I should search this time.\n\nThe results agree.');
});

test("a reply's later round of thinking is a new paragraph of its reasoning", async () => {
  const assistant = createAssistantMessage({ chatId: 'c1', content: '', createdAt: 1 });
  const { state, set, get } = createTestStoreState();
  Object.assign(state, appendMessagesToChat(state, 'c1', [assistant]));
  const options = {
    chatId: 'c1',
    assistantMessage: assistant,
    set,
    get,
    persistMessage: async () => undefined,
  };

  // The first round's stream, then (the default loop) the closing answer's own.
  const first = createMessageStreamCallbacks(options, { startedAt: 0 });
  first.onReasoningToken?.('Let me look this up this time.');
  // Tools run between the two streams, long past the first one's last flush.
  await new Promise((resolve) => setTimeout(resolve, 60));
  const closing = createMessageStreamCallbacks(options, { startedAt: 0 });
  closing.onReasoningToken?.('The results agree.');
  closing.onToken?.('Answer.');
  await closing.onDone?.('Answer.', { finishReason: 'stop' });

  const message = state.messagesById[assistant.id];
  assert.equal(message?.reasoning, 'Let me look this up this time.\n\nThe results agree.');
  // Each stream's thinking stays its own entry on the ledger.
  assert.deepEqual(
    message?.activity?.filter((item) => item.type === 'reasoning').map((item) => item.text),
    ['Let me look this up this time.', 'The results agree.'],
  );
});

test('agent rounds: thinking after beginRound is a new paragraph', async () => {
  const assistant = createAssistantMessage({ chatId: 'c2', content: '', createdAt: 1 });
  const { state, set, get } = createTestStoreState();
  Object.assign(state, appendMessagesToChat(state, 'c2', [assistant]));
  const callbacks = createMessageStreamCallbacks(
    { chatId: 'c2', assistantMessage: assistant, set, get, persistMessage: async () => undefined },
    { startedAt: 0 },
  );
  callbacks.onReasoningToken?.('First round.');
  callbacks.beginRound();
  callbacks.onReasoningToken?.('Second round.');
  await callbacks.onDone?.('', { finishReason: 'stop' });
  assert.equal(state.messagesById[assistant.id]?.reasoning, 'First round.\n\nSecond round.');
});
