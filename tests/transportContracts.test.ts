import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openrouterTransport } from '@/lib/openrouter';
import { anthropicTransport } from '@/lib/anthropic';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import type { TransportChatParams } from '@/lib/transport/types';

const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;

async function withMockFetch(mock: typeof fetch, fn: () => Promise<void>) {
  globalThis.fetch = mock;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function createSseResponse(chunks: string[]) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const baseChatParams: TransportChatParams = {
  apiKey: 'test-key',
  model: 'test-model',
  messages: [{ role: 'user', content: 'Hello' }],
};

test('openrouter transport maps 401 to unauthorized', async () => {
  await withMockFetch(
    async () => new Response(null, { status: 401 }),
    async () => {
      await assert.rejects(
        () => openrouterTransport.chatCompletion(baseChatParams),
        (err) => isApiError(err) && err.code === API_ERROR_CODES.UNAUTHORIZED,
      );
    },
  );
});

test('openrouter transport maps 429 to rate limited', async () => {
  await withMockFetch(
    async () => new Response(null, { status: 429 }),
    async () => {
      await assert.rejects(
        () => openrouterTransport.chatCompletion(baseChatParams),
        (err) => isApiError(err) && err.code === API_ERROR_CODES.RATE_LIMITED,
      );
    },
  );
});

test('anthropic transport maps 403 to unauthorized', async () => {
  await withMockFetch(
    async () => new Response(null, { status: 403 }),
    async () => {
      await assert.rejects(
        () => anthropicTransport.chatCompletion(baseChatParams),
        (err) => isApiError(err) && err.code === API_ERROR_CODES.UNAUTHORIZED,
      );
    },
  );
});

test('anthropic transport maps 429 to rate limited', async () => {
  await withMockFetch(
    async () => new Response(null, { status: 429 }),
    async () => {
      await assert.rejects(
        () => anthropicTransport.chatCompletion(baseChatParams),
        (err) => isApiError(err) && err.code === API_ERROR_CODES.RATE_LIMITED,
      );
    },
  );
});

test('openrouter stream emits tokens and normalized usage', async () => {
  const response = createSseResponse([
    'data: {"choices":[{"delta":{"content":"Hello "}}]}\n',
    'data: {"choices":[{"delta":{"reasoning":"Think "}}]}\n',
    'data: {"choices":[{"delta":{"content":"world"}}],"usage":{"prompt_tokens":2,"completion_tokens":3}}\n',
    'data: [DONE]\n\n',
  ]);

  await withMockFetch(
    async () => response,
    async () => {
      const tokens: string[] = [];
      const reasoning: string[] = [];
      let done: { full: string; usage?: unknown } | undefined;

      await openrouterTransport.streamChatCompletion({
        ...baseChatParams,
        callbacks: {
          onToken: (delta) => tokens.push(delta),
          onReasoningToken: (delta) => reasoning.push(delta),
          onDone: (full, extras) => {
            done = { full, usage: extras?.usage };
          },
        },
      });

      assert.deepEqual(tokens, ['Hello ', 'world']);
      assert.deepEqual(reasoning, ['Think ']);
      assert.equal(done?.full, 'Hello world');
      assert.deepEqual(done?.usage, {
        prompt_tokens: 2,
        completion_tokens: 3,
        total_tokens: 5,
        input_tokens: 2,
        output_tokens: 3,
      });
    },
  );
});

test('anthropic stream emits tokens and normalized usage', async () => {
  const response = createSseResponse([
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n',
    'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","text":"Reason "}}\n',
    'data: {"type":"message_delta","usage":{"input_tokens":4,"output_tokens":6}}\n',
    'data: [DONE]\n\n',
  ]);

  await withMockFetch(
    async () => response,
    async () => {
      const tokens: string[] = [];
      const reasoning: string[] = [];
      let done: { full: string; usage?: unknown } | undefined;

      await anthropicTransport.streamChatCompletion({
        ...baseChatParams,
        callbacks: {
          onToken: (delta) => tokens.push(delta),
          onReasoningToken: (delta) => reasoning.push(delta),
          onDone: (full, extras) => {
            done = { full, usage: extras?.usage };
          },
        },
      });

      assert.deepEqual(tokens, ['Hello ']);
      assert.deepEqual(reasoning, ['Reason ']);
      assert.equal(done?.full, 'Hello ');
      assert.deepEqual(done?.usage, {
        prompt_tokens: 4,
        completion_tokens: 6,
        total_tokens: 10,
        input_tokens: 4,
        output_tokens: 6,
      });
    },
  );
});
