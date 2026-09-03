import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSearchToolDefinition, mergeSearchResults, formatSourcesBlock } from './index';
import { tavilySearchProvider } from '@/lib/search/providers';
import type { SearchResult } from '@/lib/search/types';
import { NOTICE_MISSING_SEARCH_KEY } from '@/lib/store/notices';
import { mockFetch } from '../../../tests/helpers/mockFetch';
import { buildTavilyExtractBody, buildTavilySearchBody } from '@/lib/search/api/tavily';

test('getSearchToolDefinition exposes web search and fetch function schemas', () => {
  const tools = getSearchToolDefinition('tavily');
  assert.equal(Array.isArray(tools), true);
  assert.equal(tools[0]?.function?.name, 'web_search');
  assert.equal(tools[1]?.function?.name, 'web_fetch');
  const params = tools[0]?.function?.parameters;
  assert.equal(params?.type, 'object');
  assert.deepEqual(params?.required, ['query']);
  assert.deepEqual(tools[1]?.function?.parameters?.required, ['url']);
});

test('mergeSearchResults deduplicates entries by URL', () => {
  const groupA: SearchResult[] = [
    { title: 'Result A', url: 'https://example.com/a', description: 'One' },
    { title: 'Duplicate Title', url: 'https://example.com/b' },
  ];
  const groupB: SearchResult[] = [
    { title: 'Result B', url: 'https://example.com/b', description: 'Two' },
    { title: 'Unique', url: 'https://example.com/c' },
  ];
  const merged = mergeSearchResults([groupA, groupB]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].url, 'https://example.com/a');
  assert.equal(merged[1].url, 'https://example.com/b');
  assert.equal(merged[2].url, 'https://example.com/c');
});

test('formatSourcesBlock renders provider-specific heading', () => {
  const results: SearchResult[] = [
    { title: 'Alpha', url: 'https://a.example', description: 'A' },
    { title: 'Beta', url: 'https://b.example', description: 'B' },
  ];
  const block = formatSourcesBlock(results, 'tavily');
  assert.ok(block.includes('Web search results (Tavily)'));
  assert.ok(block.includes('1. Alpha — https://a.example — A'));
  const generic = formatSourcesBlock(results, 'openrouter');
  assert.ok(generic.includes('Web search results:'));
  assert.ok(!generic.includes('(Tavily)'));
});

test('buildTavilySearchBody keeps search payload lean', () => {
  const body = buildTavilySearchBody({
    query: 'latest AI education policy',
    count: 30,
    freshness: 'm',
    country: 'us',
    include_domains: ['ed.gov'],
  });

  assert.equal(body.search_depth, 'basic');
  assert.equal(body.max_results, 10);
  assert.equal(body.include_raw_content, false);
  assert.equal(body.include_answer, false);
  assert.equal(body.time_range, 'month');
  assert.equal(body.country, 'united states');
  assert.deepEqual(body.include_domains, ['ed.gov']);
});

test('buildTavilyExtractBody keeps fetch payload focused', () => {
  const body = buildTavilyExtractBody({
    url: 'https://example.com/docs',
    extract_depth: 'advanced',
    format: 'text',
    include_images: true,
    include_favicon: true,
    query: 'pricing table',
    chunks_per_source: 9,
  });

  assert.equal(body.urls, 'https://example.com/docs');
  assert.equal(body.extract_depth, 'advanced');
  assert.equal(body.format, 'text');
  assert.equal(body.include_images, true);
  assert.equal(body.include_favicon, true);
  assert.equal(body.query, 'pricing table');
  assert.equal(body.chunks_per_source, 5);
});

test('the Tavily provider returns results and reports failures', async () => {
  const restoreOk = mockFetch((async () => ({
    ok: true,
    json: async () => ({
      results: [{ title: 'Alpha', url: 'https://alpha.test', content: 'alpha desc' }],
    }),
  })) as any);
  const okResult = await tavilySearchProvider.search(
    { query: 'alpha', count: 3 },
    { apiKey: 'tvly-test' },
  );
  restoreOk();
  assert.equal(okResult.ok, true);
  assert.equal(okResult.results.length, 1);
  assert.equal(okResult.results[0]?.url, 'https://alpha.test');
  assert.equal(okResult.results[0]?.description, 'alpha desc');

  const missingKey = await tavilySearchProvider.search({ query: 'beta', count: 2 }, {});
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.error, NOTICE_MISSING_SEARCH_KEY);

  const restoreUpstream = mockFetch((async () => ({ ok: false, status: 500 })) as any);
  const upstream = await tavilySearchProvider.search(
    { query: 'beta', count: 2 },
    { apiKey: 'tvly-test' },
  );
  restoreUpstream();
  assert.equal(upstream.ok, false);
  assert.equal(upstream.error, 'tavily_error_500');

  const restoreNetwork = mockFetch((async () => {
    throw new Error('network down');
  }) as any);
  const network = await tavilySearchProvider.search(
    { query: 'gamma', count: 2 },
    { apiKey: 'tvly-test' },
  );
  restoreNetwork();
  assert.equal(network.ok, false);
  assert.equal(network.error, 'network down');
});

test('the Tavily provider sends the user key and the supported filters', async () => {
  let requestedUrl = '';
  let headers: Record<string, string> = {};
  let body: Record<string, unknown> = {};
  const restore = mockFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    headers = (init?.headers ?? {}) as Record<string, string>;
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ results: [] }) };
  }) as any);

  try {
    await tavilySearchProvider.search(
      {
        query: 'alpha',
        count: 3,
        freshness: 'd',
        country: 'us',
        include_domains: ['example.com'],
        exclude_domains: ['spam.test'],
      },
      { apiKey: 'tvly-test' },
    );
  } finally {
    restore();
  }

  assert.equal(requestedUrl, 'https://api.tavily.com/search');
  assert.equal(headers.Authorization, 'Bearer tvly-test');
  assert.equal(body.time_range, 'day');
  assert.equal(body.country, 'united states');
  assert.deepEqual(body.include_domains, ['example.com']);
  assert.deepEqual(body.exclude_domains, ['spam.test']);
});

test('the Tavily provider extracts page content and forwards options', async () => {
  let requestedUrl = '';
  let body: Record<string, unknown> = {};
  const restore = mockFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    body = JSON.parse(String(init?.body));
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            url: 'https://example.com/page',
            raw_content: '# Page\n\nExtracted content',
            images: ['https://example.com/image.png'],
          },
        ],
      }),
    };
  }) as any);

  try {
    const result = await tavilySearchProvider.fetchPage!(
      {
        url: 'https://example.com/page',
        extract_depth: 'basic',
        format: 'markdown',
        include_images: true,
        query: 'alpha',
        chunks_per_source: 2,
      },
      { apiKey: 'tvly-test' },
    );
    assert.equal(result.ok, true);
    assert.equal(result.results[0]?.raw_content, '# Page\n\nExtracted content');
  } finally {
    restore();
  }

  assert.equal(requestedUrl, 'https://api.tavily.com/extract');
  assert.equal(body.urls, 'https://example.com/page');
  assert.equal(body.include_images, true);
  assert.equal(body.query, 'alpha');
  assert.equal(body.chunks_per_source, 2);
});
