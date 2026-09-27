import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeErrorNotice } from '@/lib/store/notices';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { buildOpenRouterError } from '@/lib/openrouter/errors';
import { createTestStore } from '../../../tests/helpers/createTestStoreState';

test('a transport error code reads as words, keeping the status and the detail', () => {
  assert.equal(
    describeErrorNotice(new Error('openrouter_chat_failed (400): model not found')),
    'The model provider returned an error (400): model not found',
  );
});

const failed = (status: number, body: string) =>
  buildOpenRouterError(new Response(body, { status }), API_ERROR_CODES.OPENROUTER_CHAT_FAILED);

test("a provider's error body is read for its words, not shown raw", async () => {
  const wrapped = await failed(
    400,
    JSON.stringify({
      error: {
        message: 'Provider returned error',
        code: 400,
        metadata: {
          raw: JSON.stringify({ error: { message: 'max_tokens is too large for this model' } }),
          provider_name: 'Example',
        },
      },
    }),
  );
  assert.equal(
    describeErrorNotice(wrapped),
    'The model provider returned an error (400): max_tokens is too large for this model',
  );
  // The full body stays on the error for the logs.
  assert.match(wrapped.message, /metadata/);

  assert.equal(
    describeErrorNotice(await failed(404, '{"detail":"Not Found"}')),
    'The model provider returned an error (404): Not Found',
  );
});

test('an HTML error page becomes a plain sentence', async () => {
  const notice = describeErrorNotice(
    await failed(502, '<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>'),
  );
  assert.equal(notice, 'The model provider returned an error (502). Try again in a moment.');
});

test('a stop is not an error', () => {
  assert.equal(describeErrorNotice(new DOMException('aborted', 'AbortError')), undefined);
});

test('a notice reads as a problem unless it says otherwise, and clears its tone', () => {
  const store = createTestStore();
  store.getState().setNotice('rateLimited');
  assert.equal(store.getState().ui.noticeTone, 'error');
  store.getState().setNotice('Reasoning effort set to high.', 'info');
  assert.equal(store.getState().ui.noticeTone, 'info');
  store.getState().setNotice(undefined, 'info');
  assert.equal(store.getState().ui.noticeTone, undefined);
});
