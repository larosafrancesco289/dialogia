import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, API_ERROR_CODES } from '@/lib/api/errors';
import { streamWithRetry } from '@/lib/agent/streaming/retry';
import type { StreamCallbacks } from '@/lib/transport/types';

/** Overloaded, asking for a pause of `ms` so the tests need not wait a backoff. */
const overloaded = (ms = 0) =>
  new ApiError({
    code: API_ERROR_CODES.PROVIDER_CHAT_FAILED,
    status: 529,
    detail: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
    retryAfter: { retryAfterMs: String(ms) },
  });

/** Records what reached the caller's callbacks. */
function recorder() {
  const seen = { tokens: [] as string[], errors: [] as Error[], done: 0 };
  const callbacks: StreamCallbacks = {
    onToken: (delta) => seen.tokens.push(delta),
    onError: (error) => seen.errors.push(error),
    onDone: () => {
      seen.done += 1;
    },
  };
  return { seen, callbacks };
}

/** Like the Anthropic transport: reports a failure to onError, then throws it. */
const failsLikeAnthropic = (callbacks: StreamCallbacks, error: Error) => {
  callbacks.onError?.(error);
  throw error;
};

test('a busy provider is asked again, and the failure it reported first never reaches the reply', async () => {
  const { seen, callbacks } = recorder();
  let calls = 0;
  await streamWithRetry(
    async (guarded) => {
      calls += 1;
      if (calls < 3) failsLikeAnthropic(guarded, overloaded());
      guarded.onToken?.('Hello');
      await guarded.onDone?.('Hello');
    },
    { callbacks, signal: new AbortController().signal },
  );
  assert.equal(calls, 3);
  assert.deepEqual(seen.tokens, ['Hello']);
  assert.deepEqual(seen.errors, [], 'the reply is not ended by a failure that was retried');
  assert.equal(seen.done, 1);
});

test('a failure after the first token is not retried: the words would come twice', async () => {
  for (const begin of [
    (cb: StreamCallbacks) => cb.onToken?.('Half an'),
    (cb: StreamCallbacks) => cb.onReasoningToken?.('Let me think'),
    (cb: StreamCallbacks) => cb.onToolCallDelta?.([{ index: 0, function: { name: 'quiz' } }]),
    (cb: StreamCallbacks) => cb.onAnnotations?.([{ type: 'url_citation' }]),
  ]) {
    const { seen, callbacks } = recorder();
    let calls = 0;
    const error = overloaded();
    const caught = await streamWithRetry(
      async (guarded) => {
        calls += 1;
        begin(guarded);
        failsLikeAnthropic(guarded, error);
      },
      { callbacks, signal: new AbortController().signal },
    ).catch((e: unknown) => e);
    assert.equal(calls, 1);
    assert.equal(caught, error);
    assert.deepEqual(seen.errors, [error], 'reported as before');
  }
});

test('after three retries the failure stands, reported once as before', async () => {
  const { seen, callbacks } = recorder();
  let calls = 0;
  const caught = await streamWithRetry(
    async (guarded) => {
      calls += 1;
      failsLikeAnthropic(guarded, overloaded());
    },
    { callbacks, signal: new AbortController().signal },
  ).catch((e: unknown) => e);
  assert.equal(calls, 4, 'the first try and three more');
  assert.ok(caught instanceof ApiError && caught.status === 529);
  assert.equal(seen.errors.length, 1);
  assert.equal(seen.errors[0], caught);
});

test('a refused request is not retried, whichever way the transport reported it', async () => {
  const refused = new ApiError({ code: API_ERROR_CODES.UNAUTHORIZED, status: 401 });
  // OpenRouter throws a refused response without calling onError.
  const { seen, callbacks } = recorder();
  let calls = 0;
  const caught = await streamWithRetry(
    async () => {
      calls += 1;
      throw refused;
    },
    { callbacks, signal: new AbortController().signal },
  ).catch((e: unknown) => e);
  assert.equal(calls, 1);
  assert.equal(caught, refused);
  assert.deepEqual(seen.errors, []);
});

test('Stop during the wait ends it at once, as a Stop', async () => {
  const { seen, callbacks } = recorder();
  const controller = new AbortController();
  let calls = 0;
  const waits: Array<number | undefined> = [];
  const started = Date.now();
  const caught = await streamWithRetry(
    async (guarded) => {
      calls += 1;
      failsLikeAnthropic(guarded, overloaded(30_000));
    },
    {
      callbacks,
      signal: controller.signal,
      onWait: (at) => {
        waits.push(at);
        if (at !== undefined) setTimeout(() => controller.abort(), 20);
      },
    },
  ).catch((e: unknown) => e);
  assert.ok(Date.now() - started < 5_000, 'did not wait out the pause');
  assert.equal(calls, 1);
  assert.equal((caught as Error).name, 'AbortError');
  assert.equal(seen.errors.length, 1);
  assert.equal(seen.errors[0]?.name, 'AbortError', 'the reply reads as stopped, not failed');
  assert.equal(typeof waits[0], 'number', 'the wait was said');
  assert.equal(waits.at(-1), undefined, 'the wait is no longer said');
});

test('a request that fails after Stop is not sent again', async () => {
  const { callbacks } = recorder();
  const controller = new AbortController();
  let calls = 0;
  const caught = await streamWithRetry(
    async (guarded) => {
      calls += 1;
      controller.abort();
      failsLikeAnthropic(guarded, overloaded());
    },
    { callbacks, signal: controller.signal },
  ).catch((e: unknown) => e);
  assert.equal(calls, 1);
  assert.ok(caught instanceof ApiError);
});
