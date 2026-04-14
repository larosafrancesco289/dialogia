import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamChatCompletion } from '@/lib/anthropic/stream';
import { buildTransportAuth } from '@/lib/auth/transport';

function createSseResponse(events: unknown[]): Response {
  const payload = events
    .map(
      (event) =>
        `event: ${String((event as { type?: string }).type)}\ndata: ${JSON.stringify(event)}\n`,
    )
    .join('\n');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

test('streamChatCompletion continues pause_turn streams for Anthropic web search', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  let callCount = 0;

  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    callCount += 1;

    if (callCount === 1) {
      return createSseResponse([
        {
          type: 'message_start',
          message: {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-sonnet-4-6',
            usage: { input_tokens: 10, output_tokens: 1 },
          },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Searching...' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'server_tool_use',
            id: 'srvtool_1',
            name: 'web_search',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"query":"renewable energy latest developments"}',
          },
        },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'content_block_start',
          index: 2,
          content_block: {
            type: 'web_search_tool_result',
            tool_use_id: 'srvtool_1',
            content: [
              {
                type: 'web_search_result',
                title: 'Example',
                url: 'https://example.com',
                encrypted_content: 'abc',
              },
            ],
          },
        },
        { type: 'content_block_stop', index: 2 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'pause_turn', stop_sequence: null },
          usage: { input_tokens: 10, output_tokens: 5 },
        },
        { type: 'message_stop' },
      ]);
    }

    return createSseResponse([
      {
        type: 'message_start',
        message: {
          id: 'msg_2',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 8, output_tokens: 1 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' Final answer.' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { input_tokens: 8, output_tokens: 6 },
      },
      { type: 'message_stop' },
    ]);
  };

  let full = '';
  let finishReason: string | undefined;

  try {
    await streamChatCompletion({
      auth: buildTransportAuth({
        transport: 'anthropic',
        apiKey: 'test-key',
        useProxy: false,
      }),
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'What are the latest renewable energy developments?' }],
      plugins: [{ id: 'web' }],
      callbacks: {
        onToken(delta) {
          full += delta;
        },
        onDone(text, extras) {
          full = text;
          finishReason = extras?.finishReason;
        },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(callCount, 2);
  assert.equal(full, 'Searching... Final answer.');
  assert.equal(finishReason, 'stop');
  const secondMessages = requestBodies[1]?.messages as Array<Record<string, unknown>>;
  assert.equal(secondMessages.at(-1)?.role, 'assistant');
  assert.equal(Array.isArray(secondMessages.at(-1)?.content), true);
});
