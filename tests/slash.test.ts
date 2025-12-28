import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSlashSuggestions } from '@/lib/slash';
import type { ModelDescriptor } from '@/lib/types';

const MODELS: ModelDescriptor[] = [
  { id: 'openrouter/mixtral', name: 'Mixtral 8x7B', context_length: 0, raw: {} },
  { id: 'perplexity/pplx-7b', name: 'Perplexity 7B', context_length: 0, raw: {} },
];

test('returns no suggestions for plain text input', () => {
  assert.deepEqual(getSlashSuggestions('hello world', MODELS), []);
});

test('suggests base commands for bare slash', () => {
  const suggestions = getSlashSuggestions('/', MODELS);
  assert.ok(suggestions.some((s) => s.insert.startsWith('/model')));
  assert.ok(suggestions.some((s) => s.insert.startsWith('/search')));
});

test('returns no suggestions for multiline input', () => {
  assert.deepEqual(getSlashSuggestions('/model\nnext line', MODELS), []);
});

test('filters model suggestions by query', () => {
  const suggestions = getSlashSuggestions('/model ppl', MODELS);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.insert, '/model perplexity/pplx-7b');
});

test('filters reasoning options', () => {
  const suggestions = getSlashSuggestions('/reasoning h', MODELS);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.insert, '/reasoning high');
});

test('falls back to base commands for unknown input', () => {
  const suggestions = getSlashSuggestions('/unknown', MODELS);
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((s) => s.insert.startsWith('/')));
});
