import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSearchToolDefinition,
  mergeSearchResults,
  formatSourcesBlock,
  runBraveSearch,
  type SearchResult,
} from './searchFlow';

test('getSearchToolDefinition exposes web_search function schema', () => {
  const tools = getSearchToolDefinition();
  assert.equal(Array.isArray(tools), true);
  assert.equal(tools[0]?.function?.name, 'web_search');
  const params = tools[0]?.function?.parameters;
  assert.equal(params?.type, 'object');
  assert.deepEqual(params?.required, ['query']);
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
  const block = formatSourcesBlock(results, 'brave');
  assert.ok(block.includes('Web search results (Brave)'));
  assert.ok(block.includes('1. Alpha — https://a.example — A'));
  const generic = formatSourcesBlock(results, 'openrouter');
  assert.ok(generic.includes('Web search results:'));
});

test('runBraveSearch returns results and propagates errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        results: [{ title: 'Alpha', url: 'https://alpha.test', description: 'alpha desc' }],
      }),
    })) as any;
    const okResult = await runBraveSearch('alpha', 3);
    assert.equal(okResult.ok, true);
    assert.equal(okResult.results.length, 1);
    assert.equal(okResult.results[0]?.url, 'https://alpha.test');

    globalThis.fetch = (async () => ({ ok: false, status: 400 })) as any;
    const missingKey = await runBraveSearch('beta', 2);
    assert.equal(missingKey.ok, false);
    assert.equal(missingKey.error, 'Missing BRAVE_SEARCH_API_KEY');

    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as any;
    const network = await runBraveSearch('gamma', 2);
    assert.equal(network.ok, false);
    assert.equal(network.error, 'network down');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
