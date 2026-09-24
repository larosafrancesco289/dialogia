import { ANTHROPIC_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamChatCompletion } from '@/lib/anthropic/stream';
import { buildTransportAuth } from '@/lib/auth/transport';
import { mockFetch } from '../../../tests/helpers/mockFetch';

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
  const requestBodies: Array<Record<string, unknown>> = [];
  let callCount = 0;

  const restoreFetch = mockFetch(async (_input, init) => {
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
  });

  let full = '';
  let finishReason: string | undefined;

  try {
    await streamChatCompletion({
      auth: buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'test-key' }),
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
    restoreFetch();
  }

  assert.equal(callCount, 2);
  assert.equal(full, 'Searching... Final answer.');
  assert.equal(finishReason, 'stop');
  const secondMessages = requestBodies[1]?.messages as Array<Record<string, unknown>>;
  assert.equal(secondMessages.at(-1)?.role, 'assistant');
  assert.equal(Array.isArray(secondMessages.at(-1)?.content), true);
});

test('streamChatCompletion maps refusal stop_reason to content_filter with stop_details', async () => {
  const restoreFetch = mockFetch(async () =>
    createSseResponse([
      {
        type: 'message_start',
        message: {
          id: 'msg_r',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-fable-5',
          usage: { input_tokens: 12, output_tokens: 0 },
        },
      },
      {
        type: 'message_delta',
        delta: {
          stop_reason: 'refusal',
          stop_sequence: null,
          stop_details: { policy: 'cybersecurity' },
        },
        usage: { input_tokens: 12, output_tokens: 0 },
      },
      { type: 'message_stop' },
    ]),
  );

  let finishReason: string | undefined;
  let stopDetails: unknown;

  try {
    await streamChatCompletion({
      auth: buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'test-key' }),
      model: 'anthropic/claude-fable-5',
      messages: [{ role: 'user', content: 'Blocked prompt' }],
      callbacks: {
        onDone(_text, extras) {
          finishReason = extras?.finishReason;
          stopDetails = extras?.stopDetails;
        },
      },
    });
  } finally {
    restoreFetch();
  }

  assert.equal(finishReason, 'content_filter');
  assert.deepEqual(stopDetails, { policy: 'cybersecurity' });
});

function toolUseRound(args: {
  messageId: string;
  text: string;
  toolId: string;
  toolName: string;
  input: string;
  stopReason: string;
}): unknown[] {
  return [
    {
      type: 'message_start',
      message: { id: args.messageId, type: 'message', role: 'assistant', content: [] },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: args.text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: args.toolId, name: args.toolName, input: {} },
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: args.input },
    },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: args.stopReason, stop_sequence: null } },
    { type: 'message_stop' },
  ];
}

test('streamChatCompletion keeps tool calls from both sides of a pause_turn apart', async () => {
  // Each continuation response numbers its content blocks from 0 again, so a
  // tool_use at index 1 in the second round must not land on the first's.
  let callCount = 0;
  const restoreFetch = mockFetch(async () => {
    callCount += 1;
    return createSseResponse(
      callCount === 1
        ? toolUseRound({
            messageId: 'msg_1',
            text: 'First.',
            toolId: 'toolu_first',
            toolName: 'lookup',
            input: '{"q":"one"}',
            stopReason: 'pause_turn',
          })
        : toolUseRound({
            messageId: 'msg_2',
            text: ' Second.',
            toolId: 'toolu_second',
            toolName: 'fetch_page',
            input: '{"url":"two"}',
            stopReason: 'tool_use',
          }),
    );
  });

  const namedIndices: number[] = [];
  let toolCalls: unknown;

  try {
    await streamChatCompletion({
      auth: buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'test-key' }),
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Look both up.' }],
      tools: [
        { type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } },
        { type: 'function', function: { name: 'fetch_page', parameters: { type: 'object' } } },
      ],
      callbacks: {
        onToolCallDelta(deltas) {
          for (const delta of deltas) if (delta.function?.name) namedIndices.push(delta.index);
        },
        onDone(_text, extras) {
          toolCalls = extras?.toolCalls;
        },
      },
    });
  } finally {
    restoreFetch();
  }

  assert.equal(callCount, 2);
  assert.deepEqual(toolCalls, [
    {
      id: 'toolu_first',
      type: 'function',
      function: { name: 'lookup', arguments: '{"q":"one"}' },
    },
    {
      id: 'toolu_second',
      type: 'function',
      function: { name: 'fetch_page', arguments: '{"url":"two"}' },
    },
  ]);
  assert.equal(new Set(namedIndices).size, 2, 'each tool call is announced under its own index');
});
