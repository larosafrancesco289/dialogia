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

test('text that only starts with a slash gets no suggestions', () => {
  assert.deepEqual(getSlashSuggestions('/unknown', MODELS), []);
  assert.deepEqual(getSlashSuggestions('/etc/hosts: what is this file for?', MODELS), []);
});

test('a unique prefix narrows to its command', () => {
  const suggestions = getSlashSuggestions('/re', MODELS);
  assert.deepEqual(
    suggestions.map((s) => s.insert),
    ['/reasoning '],
  );
});

test('a command followed by prose it does not take gets no suggestions', () => {
  assert.deepEqual(getSlashSuggestions('/search for cats in Rome', MODELS), []);
  assert.deepEqual(getSlashSuggestions('/reasoning about this', MODELS), []);
});

test('a complete command still offers itself, so Enter can run it', () => {
  const suggestions = getSlashSuggestions('/search on', MODELS);
  assert.deepEqual(
    suggestions.map((s) => s.insert),
    ['/search on'],
  );
  assert.deepEqual(
    getSlashSuggestions('/help', MODELS).map((s) => s.insert),
    ['/help'],
  );
});
