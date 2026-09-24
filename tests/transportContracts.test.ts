import { ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearOpenRouterCachesForTest, openrouterTransport } from '@/lib/openrouter';
import { anthropicTransport } from '@/lib/anthropic';
import { ApiError, API_ERROR_CODES, isApiError, throwForStatus } from '@/lib/api/errors';
import type { TransportChatParams } from '@/lib/transport/types';
import { buildTransportAuth } from '@/lib/auth/transport';
import { mockFetch } from './helpers/mockFetch';

const encoder = new TextEncoder();
async function withMockFetch(mock: typeof fetch, fn: () => Promise<void>) {
  const restoreFetch = mockFetch(mock);
  try {
    await fn();
  } finally {
    restoreFetch();
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
  auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test-key' }),
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

test('openrouter stream emits tokens and normalized usage', async () => {
  const response = createSseResponse([
    'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
    'data: {"choices":[{"delta":{"reasoning":"Think "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"world"}}],"usage":{"prompt_tokens":2,"completion_tokens":3}}\n\n',
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

test('openrouter stream accepts the reasoning_content dialect', async () => {
  const response = createSseResponse([
    'data: {"choices":[{"delta":{"reasoning_content":"Think "}}]}\n\n',
    'data: {"choices":[{"delta":{"reasoning_content":"harder"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n',
    'data: [DONE]\n\n',
  ]);

  await withMockFetch(
    async () => response,
    async () => {
      const reasoning: string[] = [];
      let full: string | undefined;

      await openrouterTransport.streamChatCompletion({
        ...baseChatParams,
        callbacks: {
          onReasoningToken: (delta) => reasoning.push(delta),
          onDone: (text) => {
            full = text;
          },
        },
      });

      assert.deepEqual(reasoning, ['Think ', 'harder']);
      assert.equal(full, 'Answer');
    },
  );
});

test('openrouter stream surfaces a mid-stream error chunk instead of truncating', async () => {
  const response = createSseResponse([
    'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
    'data: {"error":{"message":"Provider returned error","code":429}}\n\n',
    'data: [DONE]\n\n',
  ]);

  await withMockFetch(
    async () => response,
    async () => {
      const tokens: string[] = [];
      const errors: unknown[] = [];
      let doneCalled = false;

      await assert.rejects(
        () =>
          openrouterTransport.streamChatCompletion({
            ...baseChatParams,
            callbacks: {
              onToken: (delta) => tokens.push(delta),
              onError: (error) => errors.push(error),
              onDone: () => {
                doneCalled = true;
              },
            },
          }),
        (err) =>
          isApiError(err) &&
          err.code === API_ERROR_CODES.RATE_LIMITED &&
          err.message.includes('Provider returned error'),
      );

      assert.deepEqual(tokens, ['Partial']);
      assert.equal(doneCalled, false);
      assert.equal(errors.length, 1);
      assert.equal(isApiError(errors[0]), true);
    },
  );
});

test('openrouter stream still ignores malformed chunks', async () => {
  const response = createSseResponse([
    'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
    'data: not-json\n\n',
    'data: [DONE]\n\n',
  ]);

  await withMockFetch(
    async () => response,
    async () => {
      let full: string | undefined;
      await openrouterTransport.streamChatCompletion({
        ...baseChatParams,
        callbacks: {
          onDone: (text) => {
            full = text;
          },
        },
      });
      assert.equal(full, 'Hi');
    },
  );
});

test('throwForStatus maps each status onto the shared codes', async () => {
  const build = async (res: Response, code: string, message?: string) =>
    new ApiError({ code, status: res.status, message: message ?? code });
  const cases: Array<[number, string | undefined, string | undefined]> = [
    [200, undefined, undefined],
    [401, API_ERROR_CODES.UNAUTHORIZED, 'Invalid API key'],
    [403, API_ERROR_CODES.UNAUTHORIZED, 'Invalid API key'],
    [429, API_ERROR_CODES.RATE_LIMITED, 'Rate limited'],
    [500, 'failed', 'failed'],
    [404, 'failed', 'failed'],
  ];
  for (const [status, code, message] of cases) {
    const failures: ApiError[] = [];
    const result = throwForStatus(new Response(null, { status }), build, 'failed', {
      onFailure: (error) => failures.push(error),
    });
    if (!code) {
      await result;
      assert.equal(failures.length, 0);
      continue;
    }
    await assert.rejects(result, (err) => {
      assert.ok(isApiError(err));
      assert.equal(err.code, code, `${status} code`);
      assert.equal(err.message, message, `${status} message`);
      return true;
    });
    assert.equal(failures.length, code === 'failed' ? 1 : 0, `${status} onFailure`);
  }
});

test('every provider call keeps its own error codes for a failed status', async () => {
  const anthropicAuth = buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'test-key' });
  const chat: TransportChatParams = {
    auth: anthropicAuth,
    model: 'anthropic/claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'Hello' }],
  };
  const callers: Array<[string, () => Promise<unknown>, Record<number, string>]> = [
    [
      'anthropic chat',
      () => anthropicTransport.chatCompletion(chat),
      {
        401: 'unauthorized',
        403: 'unauthorized',
        429: 'rate_limited',
        500: 'provider_chat_failed',
      },
    ],
    [
      'anthropic stream',
      () => anthropicTransport.streamChatCompletion(chat),
      {
        401: 'unauthorized',
        403: 'unauthorized',
        429: 'rate_limited',
        500: 'provider_chat_failed',
      },
    ],
    [
      'anthropic models',
      () => anthropicTransport.fetchModels(anthropicAuth),
      {
        401: 'unauthorized',
        403: 'unauthorized',
        429: 'rate_limited',
        500: 'provider_models_failed',
      },
    ],
    [
      'openrouter chat',
      () => openrouterTransport.chatCompletion(baseChatParams),
      {
        401: 'unauthorized',
        403: 'unauthorized',
        429: 'rate_limited',
        500: 'openrouter_chat_failed',
      },
    ],
    [
      'openrouter stream',
      () => openrouterTransport.streamChatCompletion(baseChatParams),
      {
        401: 'unauthorized',
        403: 'unauthorized',
        429: 'rate_limited',
        500: 'openrouter_chat_failed',
      },
    ],
    [
      'openrouter models',
      () => openrouterTransport.fetchModels(baseChatParams.auth),
      {
        401: 'unauthorized',
        403: 'unauthorized',
        429: 'rate_limited',
        500: 'openrouter_models_failed',
      },
    ],
  ];

  for (const [name, call, expected] of callers) {
    for (const [status, code] of Object.entries(expected)) {
      clearOpenRouterCachesForTest();
      await withMockFetch(
        async () =>
          new Response(JSON.stringify({ error: { message: 'nope' } }), {
            status: Number(status),
          }),
        async () => {
          await assert.rejects(call, (err) => {
            assert.ok(isApiError(err), `${name} ${status}`);
            assert.equal(err.code, code, `${name} ${status}`);
            assert.equal(err.status, Number(status), `${name} ${status}`);
            assert.match(err.message, new RegExp(`\\(${status}\\): nope`), `${name} ${status}`);
            return true;
          });
        },
      );
    }
  }
});
