import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openRouterSearchProvider } from '@/lib/search/providers/openrouter';
import { NATIVE_SEARCH_MODE, getSearchProvider } from '@/lib/search/providers';
import {
  OPENROUTER_SEARCH_ENGINE,
  buildOpenRouterSearchBody,
  readSearchAnnotations,
} from '@/lib/search/api/openrouterSearch';
import { OPENROUTER_KEY_REF } from '@/lib/transport/endpoints';
import { NOTICE_MISSING_SEARCH_KEY } from '@/lib/store/notices';
import { mockFetch } from '../../../../tests/helpers/mockFetch';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const citation = (url: string, title: string, content: string) => ({
  type: 'url_citation',
  url_citation: { url, title, content, start_index: 0, end_index: 1 },
});

test('OpenRouter search is its own mode, apart from provider-native search', () => {
  assert.notEqual(openRouterSearchProvider.id, NATIVE_SEARCH_MODE);
  assert.equal(getSearchProvider(openRouterSearchProvider.id), openRouterSearchProvider);
  // It runs on the chat key, so Settings must not ask for a second one.
  assert.equal(openRouterSearchProvider.keyRef, OPENROUTER_KEY_REF);
  assert.equal(openRouterSearchProvider.usesModelKey, true);
});

test('the search body names its engine, asks for no retention and clamps the count', () => {
  const body = buildOpenRouterSearchBody({ query: '  ECB deposit rate  ', count: 30 });
  assert.deepEqual(body.plugins, [
    { id: 'web', engine: OPENROUTER_SEARCH_ENGINE, max_results: 10 },
  ]);
  assert.deepEqual(body.provider, { zdr: true });
  assert.equal(body.stream, false);
  assert.equal(body.messages.at(-1)?.content, 'ECB deposit rate');
  assert.throws(() => buildOpenRouterSearchBody({ query: '   ' }));
});

test('results are read from url_citation annotations, once per URL', () => {
  const results = readSearchAnnotations({
    choices: [
      {
        message: {
          content: '…',
          annotations: [
            citation('https://ecb.europa.eu/rates', 'Key rates', '2.00%'),
            { type: 'file', file: {} },
            citation('https://ecb.europa.eu/rates', 'Key rates again', 'dup'),
            citation('https://reuters.com/ecb', 'ECB holds', 'held'),
          ],
        },
      },
    ],
  });
  assert.deepEqual(results, [
    { url: 'https://ecb.europa.eu/rates', title: 'Key rates', description: '2.00%' },
    { url: 'https://reuters.com/ecb', title: 'ECB holds', description: 'held' },
  ]);
  assert.deepEqual(readSearchAnnotations({}), []);
});

test('the provider searches on the OpenRouter key and says failures in words', async () => {
  let sent: { url: string; auth: string | null } | undefined;
  const restore = mockFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    sent = {
      url: String(input),
      auth: new Headers(init?.headers).get('Authorization'),
    };
    return json({
      choices: [{ message: { annotations: [citation('https://a.test', 'A', 'alpha')] } }],
    });
  }) as typeof fetch);
  const found = await openRouterSearchProvider.search({ query: 'alpha' }, { apiKey: 'sk-or-test' });
  restore();
  assert.equal(found.ok, true);
  assert.equal(found.results[0]?.url, 'https://a.test');
  assert.match(sent?.url ?? '', /\/chat\/completions$/);
  assert.equal(sent?.auth, 'Bearer sk-or-test');

  const missingKey = await openRouterSearchProvider.search({ query: 'alpha' }, {});
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.error, NOTICE_MISSING_SEARCH_KEY);

  const cases: Array<[number, RegExp]> = [
    [401, /did not accept the key/],
    [402, /out of credit/],
    [429, /limiting requests/],
    [503, /having trouble/],
  ];
  for (const [status, expected] of cases) {
    const restoreStatus = mockFetch((async () => json({ error: {} }, status)) as typeof fetch);
    const failed = await openRouterSearchProvider.search(
      { query: 'alpha' },
      { apiKey: 'sk-or-test' },
    );
    restoreStatus();
    assert.equal(failed.ok, false);
    assert.match(failed.error ?? '', expected, `status ${status}`);
  }
});

test('pages are read through Jina Reader with no key', async () => {
  let sent: { url: string; headers: Headers } | undefined;
  const restore = mockFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    sent = { url: String(input), headers: new Headers(init?.headers) };
    return json({ code: 200, data: { url: 'https://a.test/page', content: '# Title\n\nBody' } });
  }) as typeof fetch);
  const page = await openRouterSearchProvider.fetchPage!({ url: 'https://a.test/page' }, {});
  restore();
  assert.equal(page.ok, true);
  assert.deepEqual(page.results, [{ url: 'https://a.test/page', raw_content: '# Title\n\nBody' }]);
  assert.equal(sent?.url, 'https://r.jina.ai/https://a.test/page');
  assert.equal(sent?.headers.get('Authorization'), null);

  const restoreBusy = mockFetch((async () => json({}, 429)) as typeof fetch);
  const busy = await openRouterSearchProvider.fetchPage!({ url: 'https://a.test/page' }, {});
  restoreBusy();
  assert.equal(busy.ok, false);
  assert.match(busy.error ?? '', /page reader is busy/);

  const bad = await openRouterSearchProvider.fetchPage!({ url: 'javascript:alert(1)' }, {});
  assert.equal(bad.ok, false);
});
