import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runJinaRead } from '@/lib/search/api/jina';
import { runTavilyExtractDirect, runTavilySearchDirect } from '@/lib/search/api/tavily';
import { SearchStatusError } from '@/lib/search/api/shared';
import { openRouterSearchProvider } from '@/lib/search/providers/openrouter';
import { tavilySearchProvider } from '@/lib/search/providers/tavily';
import { mockFetch } from '../../../../tests/helpers/mockFetch';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function withResponse<T>(body: unknown, run: () => Promise<T>, status = 200): Promise<T> {
  const restore = mockFetch(async () => json(body, status));
  try {
    return await run();
  } finally {
    restore();
  }
}

// What Tavily answers for a page it could not load: 200, no results, the page under failed_results.
const TAVILY_FAILED = {
  results: [],
  failed_results: [{ url: 'https://walled.test/', error: 'Failed to fetch url' }],
};

test('Tavily search results carry their snippet as the description', async () => {
  const results = await withResponse(
    { results: [{ title: 'A', url: 'https://a.test', content: 'About A', score: 0.9 }] },
    () => runTavilySearchDirect({ query: 'a' }, { apiKey: 'tvly-test' }),
  );
  assert.deepEqual(results, [
    { title: 'A', url: 'https://a.test', description: 'About A', score: 0.9 },
  ]);
});

test('a Tavily refusal carries its status, for the provider to put in words', async () => {
  await assert.rejects(
    withResponse({}, () => runTavilyExtractDirect({ url: 'https://a.test' }, { apiKey: 'k' }), 432),
    (error: unknown) => error instanceof SearchStatusError && error.status === 432,
  );
});

test('a page Tavily could not load comes back with nothing in it', async () => {
  const pages = await withResponse(TAVILY_FAILED, () =>
    runTavilyExtractDirect({ url: 'https://walled.test/' }, { apiKey: 'tvly-test' }),
  );
  assert.deepEqual(pages, []);
});

test('a page Jina Reader read empty comes back with nothing in it', async () => {
  const pages = await withResponse(
    { code: 200, data: { url: 'https://empty.test/', content: '' } },
    () => runJinaRead({ url: 'https://empty.test/' }),
  );
  assert.deepEqual(pages, []);
});

test('a page that would not load is a failed fetch, not an empty success', async () => {
  const tavily = await withResponse(TAVILY_FAILED, () =>
    tavilySearchProvider.fetchPage!({ url: 'https://walled.test/' }, { apiKey: 'tvly-test' }),
  );
  assert.equal(tavily.ok, false);
  assert.equal(tavily.ok ? '' : tavily.error, 'Tavily could not fetch this page.');

  const blank = await withResponse(
    { results: [{ url: 'https://b.test/', raw_content: '  \n' }] },
    () => tavilySearchProvider.fetchPage!({ url: 'https://b.test/' }, { apiKey: 'tvly-test' }),
  );
  assert.equal(blank.ok, false, 'whitespace is nothing to read');

  const reader = await withResponse({ data: { content: '' } }, () =>
    openRouterSearchProvider.fetchPage!({ url: 'https://empty.test/' }, {}),
  );
  assert.equal(reader.ok, false);
  assert.equal(reader.ok ? '' : reader.error, 'Could not read this page.');
});
