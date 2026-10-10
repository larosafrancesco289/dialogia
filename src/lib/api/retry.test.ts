import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, API_ERROR_CODES, throwForStatus } from '@/lib/api/errors';
import { decideRetry, isTransientError, requestedWaitMs } from '@/lib/api/retry';
import { buildAnthropicError } from '@/lib/anthropic/errors';
import { buildOpenRouterStreamError } from '@/lib/openrouter/errors';

const failed = (status: number, detail?: unknown) =>
  new ApiError({ code: API_ERROR_CODES.PROVIDER_CHAT_FAILED, status, detail });

const wrapped = (inner: Error) =>
  new ApiError({
    code: API_ERROR_CODES.PROVIDER_CHAT_FAILED,
    message: inner.message,
    detail: inner,
  });

test('busy, overloaded and unreachable providers are retried; refused requests never are', () => {
  const table: Array<[string, unknown, boolean]> = [
    ['408', failed(408), true],
    ['429', new ApiError({ code: API_ERROR_CODES.RATE_LIMITED, status: 429 }), true],
    ['500', failed(500), true],
    ['502', failed(502), true],
    ['503', failed(503), true],
    ['504', failed(504), true],
    ['529', failed(529, { type: 'error', error: { type: 'overloaded_error' } }), true],
    ['400', failed(400), false],
    ['400 that mentions a rate limit', failed(400, 'rate limit exceeded'), false],
    ['401', new ApiError({ code: API_ERROR_CODES.UNAUTHORIZED, status: 401 }), false],
    ['403', new ApiError({ code: API_ERROR_CODES.UNAUTHORIZED, status: 403 }), false],
    ['404', failed(404), false],
    ['422', failed(422), false],
    ['402', failed(402), false],
    [
      'Anthropic overloaded_error event',
      new ApiError({
        code: API_ERROR_CODES.PROVIDER_CHAT_FAILED,
        message: 'Overloaded',
        detail: { type: 'overloaded_error', message: 'Overloaded' },
      }),
      true,
    ],
    [
      'Anthropic rate_limit_error event',
      new ApiError({ code: API_ERROR_CODES.RATE_LIMITED, detail: { type: 'rate_limit_error' } }),
      true,
    ],
    [
      'OpenRouter stream error saying overloaded',
      buildOpenRouterStreamError({ message: 'Provider is overloaded, try later' }),
      true,
    ],
    ['OpenRouter stream error with a 502', buildOpenRouterStreamError({ code: 502 }), true],
    ['OpenRouter stream error with a 400', buildOpenRouterStreamError({ code: 400 }), false],
    [
      'a stream error that says nothing of load',
      new ApiError({ code: API_ERROR_CODES.PROVIDER_CHAT_FAILED, detail: { message: 'bad' } }),
      false,
    ],
    ['fetch TypeError', new TypeError('Failed to fetch'), true],
    ['fetch TypeError wrapped', wrapped(new TypeError('Load failed')), true],
    [
      'a TypeError from a bug',
      new TypeError("Cannot read properties of undefined (reading 'x')"),
      false,
    ],
    ['a Stop', Object.assign(new Error('aborted'), { name: 'AbortError' }), false],
    [
      'a Stop wrapped by a transport',
      wrapped(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })),
      false,
    ],
    ['stream cut off', new ApiError({ code: API_ERROR_CODES.STREAM_CUT_OFF }), false],
    ['a plain error', new Error('boom'), false],
    ['nothing', undefined, false],
  ];
  for (const [name, error, expected] of table) {
    assert.equal(isTransientError(error), expected, name);
  }
});

const asking = (retryAfter: { retryAfter?: string; retryAfterMs?: string }) =>
  new ApiError({ code: API_ERROR_CODES.RATE_LIMITED, status: 429, retryAfter });

test('retry-after is read as seconds, an HTTP date or milliseconds', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  assert.equal(requestedWaitMs(asking({ retryAfter: '7' }), now), 7_000);
  assert.equal(requestedWaitMs(asking({ retryAfter: '1.5' }), now), 1_500);
  assert.equal(
    requestedWaitMs(asking({ retryAfter: 'Sat, 10 Oct 2026 12:00:12 GMT' }), now),
    12_000,
  );
  assert.equal(requestedWaitMs(asking({ retryAfter: 'Sat, 10 Oct 2026 11:59:00 GMT' }), now), 0);
  assert.equal(requestedWaitMs(asking({ retryAfterMs: '250' }), now), 250);
  // The finer one wins when both are sent.
  assert.equal(requestedWaitMs(asking({ retryAfter: '1', retryAfterMs: '900' }), now), 900);
  assert.equal(requestedWaitMs(asking({}), now), undefined);
  assert.equal(requestedWaitMs(asking({ retryAfter: 'soon' }), now), undefined);
  assert.equal(requestedWaitMs(asking({ retryAfter: '-3' }), now), undefined);
  assert.equal(requestedWaitMs(new Error('no response'), now), undefined);
});

test('a failed response keeps the retry-after headers it carried', async () => {
  const headers = new Headers({ 'retry-after': '3' });
  const res = new Response('{"error":{"type":"overloaded_error"}}', { status: 529, headers });
  const error = await throwForStatus(res, buildAnthropicError, API_ERROR_CODES.PROVIDER_CHAT_FAILED)
    .then(() => undefined)
    .catch((caught: unknown) => caught);
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 529);
  assert.equal(requestedWaitMs(error), 3_000);

  const limited = new Response('', { status: 429, headers: { 'retry-after-ms': '40' } });
  const rateError = await throwForStatus(limited, buildAnthropicError, 'x').catch(
    (e: unknown) => e,
  );
  assert.equal(requestedWaitMs(rateError), 40);
});

test('the wait asked for is honoured, and a wait over a minute is not waited on', () => {
  assert.deepEqual(decideRetry(asking({ retryAfter: '4' }), 0), { retry: true, delayMs: 4_000 });
  assert.deepEqual(decideRetry(asking({ retryAfter: '60' }), 0), { retry: true, delayMs: 60_000 });
  assert.deepEqual(decideRetry(asking({ retryAfter: '61' }), 0), { retry: false });
  assert.deepEqual(decideRetry(asking({ retryAfter: '86400' }), 0), { retry: false });
});

test('backoff is full jitter, doubling from one second up to twenty', () => {
  const busy = failed(503);
  const at = (retries: number, random: number) => {
    const decision = decideRetry(busy, retries, { random: () => random });
    assert.equal(decision.retry, true);
    return decision.retry ? decision.delayMs : -1;
  };
  assert.equal(at(0, 0), 0);
  assert.equal(at(0, 0.5), 500);
  assert.equal(at(0, 0.999), 999);
  assert.equal(at(1, 0.999), 1_998);
  assert.equal(at(2, 0.5), 2_000);
  for (let retries = 0; retries < 3; retries += 1) {
    const ceiling = Math.min(20_000, 1_000 * 2 ** retries);
    for (let i = 0; i < 200; i += 1) {
      const delay = at(retries, Math.random());
      assert.ok(delay >= 0 && delay < ceiling, `retry ${retries}: ${delay}`);
    }
  }
  // A random source out of range never makes a delay out of bounds.
  assert.equal(at(0, 2), 1_000);
  assert.equal(at(0, -1), 0);
});

test('a request is sent again at most three times', () => {
  const busy = failed(529);
  assert.equal(decideRetry(busy, 0).retry, true);
  assert.equal(decideRetry(busy, 2).retry, true);
  assert.equal(decideRetry(busy, 3).retry, false);
  assert.equal(decideRetry(failed(400), 0).retry, false);
});
