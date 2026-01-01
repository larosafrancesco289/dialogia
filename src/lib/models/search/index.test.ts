import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ModelDescriptor } from '@/lib/types';
import {
  buildModelSearchResults,
  getHighlightSegments,
  normalizeModelQuery,
  splitModelQuery,
} from '@/lib/models/search';

const models: ModelDescriptor[] = [
  {
    id: 'openrouter/alpha',
    name: 'Alpha Model',
    providerDisplay: 'OpenRouter',
  },
  {
    id: 'openrouter/beta',
    name: 'Beta Model',
    providerDisplay: 'OpenRouter',
  },
  {
    id: 'custom/gamma',
    name: 'Gamma Suite',
    providerDisplay: 'CustomProvider',
  },
];

test('buildModelSearchResults filters by query words', () => {
  const normalized = normalizeModelQuery('alpha');
  const results = buildModelSearchResults(models, splitModelQuery(normalized), {
    maxResults: 10,
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'openrouter/alpha');
});

test('buildModelSearchResults matches provider label text', () => {
  const normalized = normalizeModelQuery('custom provider gamma');
  const results = buildModelSearchResults(models, splitModelQuery(normalized), {
    maxResults: 10,
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'custom/gamma');
});

test('getHighlightSegments marks query words', () => {
  const segments = getHighlightSegments('Alpha Model', ['alpha']);
  assert.equal(segments[0].text, 'Alpha');
  assert.equal(segments[0].highlight, true);
  assert.equal(segments[1].highlight, false);
});
