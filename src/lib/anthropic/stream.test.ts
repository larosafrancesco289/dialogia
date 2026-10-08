import { ANTHROPIC_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamChatCompletion } from '@/lib/anthropic/stream';
import {
  applyStreamEvent,
  createStreamTurn,
  finishedToolCalls,
  roundContent,
  turnContent,
} from '@/lib/anthropic/streamEvents';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import { buildTransportAuth } from '@/lib/auth/transport';
import { sourcesFromAnnotations } from '@/lib/ui/messageSources';
import type { StreamCallbacks } from '@/lib/transport/types';
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

test('applyStreamEvent folds a recorded stream without fetch', () => {
  const turn = createStreamTurn();
  const tokens: string[] = [];
  const reasoning: string[] = [];
  const named: Array<[number, string | undefined]> = [];
  const emit = {
    onToken: (delta: string) => tokens.push(delta),
    onReasoningToken: (delta: string) => reasoning.push(delta),
    onToolCallDelta: (deltas: Array<{ index: number; function?: { name?: string } }>) => {
      for (const delta of deltas) named.push([delta.index, delta.function?.name]);
    },
  };
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 9, output_tokens: 1 } } },
    { type: 'ping' },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Hmm, ' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'ok.' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Let me ' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'check.' } },
    { type: 'content_block_stop', index: 1 },
    {
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: {} },
    },
    {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '{"q":' },
    },
    {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '"bayes"}' },
    },
    { type: 'content_block_stop', index: 2 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: 'message_stop' },
  ];
  for (const event of events) applyStreamEvent(turn, event, emit);

  assert.equal(turn.text, 'Let me check.');
  assert.deepEqual(tokens, ['Let me ', 'check.']);
  assert.deepEqual(reasoning, ['Hmm, ', 'ok.']);
  assert.deepEqual(named, [[2, 'lookup']]);
  assert.equal(turn.stopReason, 'tool_use');
  assert.equal(turn.round.usage?.input_tokens, 9);
  assert.equal(turn.round.usage?.output_tokens, 20);
  assert.deepEqual(turn.thinkingBlocks, [
    { type: 'thinking', thinking: 'Hmm, ok.', signature: 'sig' },
  ]);
  assert.deepEqual(finishedToolCalls(turn), [
    { id: 'toolu_1', type: 'function', function: { name: 'lookup', arguments: '{"q":"bayes"}' } },
  ]);
  // What a continuation would send back: the blocks complete, the input parsed.
  assert.deepEqual(roundContent(turn), [
    { type: 'thinking', thinking: 'Hmm, ok.', signature: 'sig' },
    { type: 'text', text: 'Let me check.' },
    { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'bayes' } },
  ]);
});

test('applyStreamEvent throws an error event as an ApiError', () => {
  assert.throws(
    () =>
      applyStreamEvent(createStreamTurn(), {
        type: 'error',
        error: { type: 'rate_limit_error', message: 'Slow down' },
      }),
    (err) =>
      isApiError(err) && err.code === API_ERROR_CODES.RATE_LIMITED && err.message === 'Slow down',
  );
  assert.throws(
    () =>
      applyStreamEvent(createStreamTurn(), { type: 'error', error: { type: 'overloaded_error' } }),
    (err) =>
      isApiError(err) &&
      err.code === API_ERROR_CODES.PROVIDER_CHAT_FAILED &&
      err.message === 'Anthropic stream error',
  );
});

test("streamChatCompletion reports a native web search's sources as annotations", async () => {
  const restoreFetch = mockFetch(async () =>
    createSseResponse([
      { type: 'message_start', message: { usage: { input_tokens: 9, output_tokens: 1 } } },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: {} },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: 'srv_1',
          content: [
            { type: 'web_search_result', title: 'Solar', url: 'https://solar.test' },
            { type: 'web_search_result', title: 'Wind', url: 'https://wind.test' },
          ],
        },
      },
      { type: 'content_block_stop', index: 1 },
      {
        type: 'content_block_start',
        index: 2,
        content_block: { type: 'text', text: '', citations: [] },
      },
      {
        type: 'content_block_delta',
        index: 2,
        delta: {
          type: 'citations_delta',
          citation: {
            type: 'web_search_result_location',
            url: 'https://solar.test',
            title: 'Solar',
            cited_text: 'Solar capacity grew 30%.',
            encrypted_index: 'x',
          },
        },
      },
      { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Solar.' } },
      { type: 'content_block_stop', index: 2 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ]),
  );
  const reported: unknown[] = [];
  let annotations: unknown;
  try {
    await streamChatCompletion({
      auth: buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'test-key' }),
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Which grew fastest?' }],
      plugins: [{ id: 'web' }],
      callbacks: {
        onAnnotations: (value) => reported.push(value),
        onDone: (_text, extras) => {
          annotations = extras?.annotations;
        },
      },
    });
  } finally {
    restoreFetch();
  }
  const sources = [
    { url: 'https://solar.test', title: 'Solar', description: 'Solar capacity grew 30%.' },
    { url: 'https://wind.test', title: 'Wind' },
  ];
  assert.deepEqual(sourcesFromAnnotations(annotations), sources);
  // Sources show while the reply streams: the last report is the whole set.
  assert.deepEqual(sourcesFromAnnotations(reported.at(-1)), sources);
});

const fold = (events: unknown[]) => {
  const turn = createStreamTurn();
  for (const event of events) applyStreamEvent(turn, event);
  return turn;
};

const toolUse = (index: number, id: string, json: string, stop = true) => [
  {
    type: 'content_block_start',
    index,
    content_block: { type: 'tool_use', id, name: 'record_evidence', input: {} },
  },
  { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json } },
  ...(stop ? [{ type: 'content_block_stop', index }] : []),
];

test('a cut-off response calls nothing: its arguments never finished', () => {
  const ended = [
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ];
  // The connection dropped mid-arguments, then before message_stop.
  assert.equal(finishedToolCalls(fold(toolUse(0, 'a', '{"node":'))), undefined);
  assert.equal(finishedToolCalls(fold(toolUse(0, 'a', '{"node":"x"}'))), undefined);
  // Ended properly, only the call whose block stopped counts.
  const calls = finishedToolCalls(
    fold([...toolUse(0, 'a', '{"node":"x"}'), ...toolUse(1, 'b', '{"no', false), ...ended]),
  );
  assert.deepEqual(
    calls?.map((call) => [call.id, call.function.arguments]),
    [['a', '{"node":"x"}']],
  );
});

test('the turn keeps the reply block for block, as the next request sends it back', () => {
  const citation = {
    type: 'web_search_result_location',
    url: 'https://solar.test',
    title: 'Solar',
    cited_text: 'Solar grew.',
    encrypted_index: 'x',
  };
  const turn = fold([
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Hm.' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 's1' } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'redacted_thinking', data: 'opaque' },
    },
    { type: 'content_block_stop', index: 1 },
    {
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'server_tool_use', id: 'srv', name: 'web_search', input: {} },
    },
    {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '{"query":"solar"}' },
    },
    { type: 'content_block_stop', index: 2 },
    {
      type: 'content_block_start',
      index: 3,
      content_block: { type: 'web_search_tool_result', tool_use_id: 'srv', content: [] },
    },
    { type: 'content_block_stop', index: 3 },
    { type: 'content_block_start', index: 4, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 4, delta: { type: 'citations_delta', citation } },
    { type: 'content_block_delta', index: 4, delta: { type: 'text_delta', text: 'Solar.' } },
    { type: 'content_block_stop', index: 4 },
    ...toolUse(5, 'call', '{"node":"x"}'),
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
  assert.deepEqual(turnContent(turn), [
    { type: 'thinking', thinking: 'Hm.', signature: 's1' },
    { type: 'redacted_thinking', data: 'opaque' },
    { type: 'server_tool_use', id: 'srv', name: 'web_search', input: { query: 'solar' } },
    { type: 'web_search_tool_result', tool_use_id: 'srv', content: [] },
    { type: 'text', text: 'Solar.', citations: [citation] },
    { type: 'tool_use', id: 'call', name: 'record_evidence', input: { node: 'x' } },
  ]);
});

test('a search filtered in code streams whole, lists its sources and resumes in its container', async () => {
  const caller = { type: 'code_execution_20260120', tool_id: 'srv_code' };
  const results = [
    { type: 'web_search_result', title: 'Tides', url: 'https://a.test', encrypted_content: 'e1' },
    { type: 'web_search_result', title: 'Moon', url: 'https://b.test', encrypted_content: 'e2' },
  ];
  const code = "r = await web_search({'query': 'tides'})\nprint(r[:1])";
  const firstRound = [
    { type: 'server_tool_use', id: 'srv_code', name: 'code_execution', input: { code } },
    // A search the code ran arrives whole: no input deltas follow it.
    {
      type: 'server_tool_use',
      id: 'srv_ws',
      name: 'web_search',
      input: { query: 'tides' },
      caller,
    },
    { type: 'web_search_tool_result', tool_use_id: 'srv_ws', content: results, caller },
  ];
  const codeResult = {
    type: 'code_execution_tool_result',
    tool_use_id: 'srv_code',
    content: {
      type: 'code_execution_result',
      stdout: "[{'url': 'https://a.test'}]",
      stderr: '',
      return_code: 0,
      content: [],
    },
  };
  const citation = {
    type: 'web_search_result_location',
    url: 'https://a.test',
    title: 'Tides',
    encrypted_index: 'i1',
    cited_text: 'Tides follow the moon.',
  };
  const requestBodies: Array<Record<string, unknown>> = [];
  const restoreFetch = mockFetch(async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    if (requestBodies.length === 1) {
      return createSseResponse([
        { type: 'message_start', message: { id: 'm1', role: 'assistant', content: [] } },
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'server_tool_use',
            id: 'srv_code',
            name: 'code_execution',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify({ code }) },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: firstRound[1] },
        { type: 'content_block_stop', index: 1 },
        { type: 'content_block_start', index: 2, content_block: firstRound[2] },
        { type: 'content_block_stop', index: 2 },
        {
          type: 'message_delta',
          delta: {
            stop_reason: 'pause_turn',
            container: { id: 'container_1', expires_at: '2026-10-08T12:00:00Z' },
          },
        },
        { type: 'message_stop' },
      ]);
    }
    return createSseResponse([
      { type: 'message_start', message: { id: 'm2', role: 'assistant', content: [] } },
      { type: 'content_block_start', index: 0, content_block: codeResult },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'Tides follow the moon.' },
      },
      { type: 'content_block_delta', index: 1, delta: { type: 'citations_delta', citation } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ]);
  });

  let shown = '';
  const toolDeltas: unknown[] = [];
  let extras: Parameters<NonNullable<StreamCallbacks['onDone']>>[1];
  try {
    await streamChatCompletion({
      auth: buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'test-key' }),
      model: 'claude-opus-5-5',
      messages: [{ role: 'user', content: 'Why are there tides?' }],
      plugins: [{ id: 'web' }],
      callbacks: {
        onToken: (delta) => (shown += delta),
        onToolCallDelta: (deltas) => toolDeltas.push(...deltas),
        onDone: (_text, done) => {
          extras = done;
        },
      },
    });
  } finally {
    restoreFetch();
  }

  // The code and its output are the model's working, never the learner's reading.
  assert.equal(shown, 'Tides follow the moon.');
  // Server tools are Anthropic's to run, never the app's.
  assert.deepEqual(toolDeltas, []);
  assert.equal(extras?.toolCalls, undefined);
  // Every result the search found is a source, not only the cited one.
  assert.deepEqual(
    sourcesFromAnnotations(extras?.annotations).map((source) => source.url),
    ['https://a.test', 'https://b.test'],
  );
  // The paused round goes back as it came, in the container its code runs in.
  assert.equal(requestBodies[1]?.container, 'container_1');
  const resumed = requestBodies[1]?.messages as Array<{ role: string; content: unknown }>;
  assert.deepEqual(resumed.at(-1), { role: 'assistant', content: firstRound });
  assert.deepEqual(extras?.reasoningDetails, {
    provider: 'anthropic',
    thinkingBlocks: [],
    content: [
      ...firstRound,
      codeResult,
      { type: 'text', text: 'Tides follow the moon.', citations: [citation] },
    ],
    container: 'container_1',
  });
});
