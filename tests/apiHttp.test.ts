import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApiHeaders, toBodyInit, withAbortTimeout } from '@/lib/api/http';

test('toBodyInit stringifies objects', () => {
  const body = toBodyInit({ hello: 'world' });
  assert.equal(typeof body, 'string');
  assert.equal(body, JSON.stringify({ hello: 'world' }));
});

test('buildApiHeaders merges defaults and custom headers', () => {
  const { headers } = buildApiHeaders({
    origin: 'https://example.com',
    headers: { Authorization: 'Bearer token' },
    body: 'payload',
    includeDefaults: true,
  });
  assert.equal(headers.Authorization, 'Bearer token');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['X-Title'], 'Dialogia');
  assert.equal(headers['HTTP-Referer'], 'https://example.com');
});

test('withAbortTimeout aborts after configured delay', async () => {
  const { signal, cleanup } = withAbortTimeout({ timeoutMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(signal.aborted, true);
  cleanup();
});

test('withAbortTimeout mirrors external abort signal', () => {
  const controller = new AbortController();
  const { signal, cleanup } = withAbortTimeout({ signal: controller.signal, timeoutMs: 100 });
  controller.abort();
  assert.equal(signal.aborted, true);
  cleanup();
});
