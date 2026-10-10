import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTICE_CATALOG,
  describeDroppedAttachments,
  describeErrorDetail,
  describeErrorNotice,
} from '@/lib/store/notices';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { buildOpenRouterError, buildOpenRouterStreamError } from '@/lib/openrouter/errors';
import { createTestStore } from '../../../tests/helpers/createTestStoreState';

test('a transport error code reads as words, keeping the status and the detail', () => {
  assert.equal(
    describeErrorNotice(new Error('openrouter_chat_failed (400): model not found')),
    'The model provider returned an error (400): model not found',
  );
});

const failed = (status: number, body: string) =>
  buildOpenRouterError(new Response(body, { status }), API_ERROR_CODES.OPENROUTER_CHAT_FAILED);

test("a failed reply is said in plain words, the provider's own kept for Details", async () => {
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
  assert.equal(describeErrorNotice(wrapped), NOTICE_CATALOG.requestRefused);
  assert.equal(describeErrorDetail(wrapped), '400: max_tokens is too large for this model');
  // The full body stays on the error for the logs.
  assert.match(wrapped.message, /metadata/);
});

test('out of credit, a missing model and trouble on the provider’s side each say what to do', async () => {
  const credit = await failed(402, '{"error":{"message":"Insufficient credits"}}');
  assert.equal(describeErrorNotice(credit), NOTICE_CATALOG.outOfCredit);
  assert.equal(describeErrorDetail(credit), '402: Insufficient credits');

  assert.equal(
    describeErrorNotice(await failed(404, '{"detail":"Not Found"}')),
    NOTICE_CATALOG.modelNotFound,
  );
  // Ollama behind a proxy: a missing model as a 500.
  const ollama = await failed(
    500,
    '{"error":{"message":"model \\"llama3.2:3b\\" not found, try pulling it first"}}',
  );
  assert.equal(describeErrorNotice(ollama), NOTICE_CATALOG.modelNotFound);
  assert.match(describeErrorDetail(ollama) ?? '', /^500: model "llama3.2:3b" not found/);

  assert.equal(
    describeErrorNotice(await failed(503, '{"error":{"message":"Overloaded"}}')),
    NOTICE_CATALOG.providerDown,
  );
  // Sent mid-stream, with no status: the upstream model failed.
  assert.equal(
    describeErrorNotice(buildOpenRouterStreamError({ message: 'Upstream error' })),
    NOTICE_CATALOG.providerDown,
  );
});

test('an HTML error page becomes a plain sentence, with only its status as the detail', async () => {
  const error = await failed(
    502,
    '<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>',
  );
  assert.equal(describeErrorNotice(error), NOTICE_CATALOG.providerDown);
  assert.equal(describeErrorDetail(error), '502');
});

test('a model list that fails still names the list, not a reply', async () => {
  const error = await buildOpenRouterError(
    new Response('<html>oops</html>', { status: 502 }),
    API_ERROR_CODES.OPENROUTER_MODELS_FAILED,
  );
  assert.equal(
    describeErrorNotice(error),
    'Could not load the model list (502). Try again in a moment.',
  );
  assert.equal(describeErrorDetail(error), undefined);
});

test('an expired key says so; any other refused key reads as rejected', async () => {
  const refused = (message: string) =>
    buildOpenRouterError(
      new Response(JSON.stringify({ error: { message, code: 401 } }), { status: 401 }),
      API_ERROR_CODES.UNAUTHORIZED,
      'Invalid API key',
    );
  assert.equal(describeErrorNotice(await refused('API key expired.')), NOTICE_CATALOG.expiredKey);
  assert.equal(
    describeErrorNotice(await refused('No auth credentials found')),
    NOTICE_CATALOG.invalidKey,
  );
  // Raised mid-stream, the same body arrives as a chunk.
  assert.equal(
    describeErrorNotice(buildOpenRouterStreamError({ message: 'Key EXPIRED', code: 401 })),
    NOTICE_CATALOG.expiredKey,
  );
});

test('a stop is not an error', () => {
  assert.equal(describeErrorNotice(new DOMException('aborted', 'AbortError')), undefined);
});

test('a notice reads as a problem unless it says otherwise, and clears its tone', () => {
  const store = createTestStore();
  store.getState().setNotice('rateLimited');
  assert.equal(store.getState().ui.noticeTone, 'error');
  store.getState().setNotice('Thinking effort set to high.', 'info');
  assert.equal(store.getState().ui.noticeTone, 'info');
  store.getState().setNotice(undefined, 'info');
  assert.equal(store.getState().ui.noticeTone, undefined);
});

test('left-out attachments read as a sentence, in the right number', () => {
  const tail = 'left out: this model does not accept them.';
  assert.equal(describeDroppedAttachments(['audio']), `Audio was ${tail}`);
  assert.equal(describeDroppedAttachments(['image']), `Images were ${tail}`);
  assert.equal(describeDroppedAttachments(['pdf']), `PDFs were ${tail}`);
  assert.equal(describeDroppedAttachments(['image', 'audio']), `Images and audio were ${tail}`);
  assert.equal(
    describeDroppedAttachments(['image', 'audio', 'pdf']),
    `Images, audio and PDFs were ${tail}`,
  );
});
