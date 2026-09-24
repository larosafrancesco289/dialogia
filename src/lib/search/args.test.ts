import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebFetchArgs, normalizeWebSearchArgs } from './args';

// Tool arguments are model output: any field may be missing, mistyped or out of
// range, and none of that may reach the search provider as-is.

test('normalizeWebSearchArgs keeps valid fields and trims the query', () => {
  assert.deepEqual(
    normalizeWebSearchArgs({
      query: '  rust borrow checker  ',
      count: 5,
      freshness: 'w',
      country: 'US',
      include_domains: ['doc.rust-lang.org'],
      exclude_domains: ['example.com'],
      provider: 'tavily',
    }),
    {
      query: 'rust borrow checker',
      count: 5,
      freshness: 'w',
      country: 'US',
      include_domains: ['doc.rust-lang.org'],
      exclude_domains: ['example.com'],
      provider: 'tavily',
    },
  );
});

test('normalizeWebSearchArgs clamps the count and drops what it cannot use', () => {
  const count = (value: unknown) => normalizeWebSearchArgs({ query: 'q', count: value }).count;
  assert.equal(count(0), 1);
  assert.equal(count(-3), 1);
  assert.equal(count(50), 10);
  assert.equal(count(3.9), 3);
  assert.equal(count(Number.NaN), undefined);
  assert.equal(count(Number.POSITIVE_INFINITY), undefined);
  assert.equal(count('5'), undefined);

  assert.deepEqual(
    normalizeWebSearchArgs({
      query: 42,
      freshness: 'hour',
      country: '',
      include_domains: 'example.com',
      exclude_domains: [1, '', null],
      provider: 'google',
    }),
    { query: '' },
  );
  // Non-strings are filtered out of a domain list; an empty list is dropped.
  assert.deepEqual(
    normalizeWebSearchArgs({ query: 'q', include_domains: ['a.com', 7, ''] }).include_domains,
    ['a.com'],
  );
});

test('the retired brave provider is read as tavily', () => {
  assert.equal(normalizeWebSearchArgs({ query: 'q', provider: 'brave' }).provider, 'tavily');
});

test('normalizeWebFetchArgs keeps valid fields and clamps chunks_per_source', () => {
  assert.deepEqual(
    normalizeWebFetchArgs({
      url: ' https://example.com/a ',
      extract_depth: 'advanced',
      format: 'text',
      include_images: false,
      include_favicon: true,
      query: ' pricing ',
      chunks_per_source: 9,
      provider: 'tavily',
    }),
    {
      url: 'https://example.com/a',
      extract_depth: 'advanced',
      format: 'text',
      include_images: false,
      include_favicon: true,
      query: 'pricing',
      chunks_per_source: 5,
      provider: 'tavily',
    },
  );
  assert.equal(normalizeWebFetchArgs({ url: 'u', chunks_per_source: 0 }).chunks_per_source, 1);
});

test('normalizeWebFetchArgs drops mistyped and unknown values', () => {
  assert.deepEqual(
    normalizeWebFetchArgs({
      url: 'https://example.com',
      extract_depth: 'deep',
      format: 'html',
      include_images: 'yes',
      include_favicon: 1,
      query: '   ',
      chunks_per_source: '3',
      provider: 'brave',
    }),
    { url: 'https://example.com' },
  );
});
