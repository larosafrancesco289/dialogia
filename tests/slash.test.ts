import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSlashSuggestions, slashEnterAction } from '@/lib/slash';
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

test('/help reads the same whether listed or typed out', () => {
  const listed = getSlashSuggestions('/', MODELS).find((s) => s.title === '/help');
  const typed = getSlashSuggestions('/help', MODELS)[0];
  assert.ok(listed?.subtitle);
  assert.equal(typed?.subtitle, listed.subtitle);
});

const enter = (value: string, activeIndex = 0) =>
  slashEnterAction(value, getSlashSuggestions(value, MODELS), activeIndex);

test('Return runs a command with nothing left to type', () => {
  // The only command left, and it takes no argument.
  assert.deepEqual(enter('/he'), { run: '/help' });
  // The only suggestion left is a whole command.
  assert.deepEqual(enter('/reasoning h'), { run: '/reasoning high' });
  assert.deepEqual(enter('/model ppl'), { run: '/model perplexity/pplx-7b' });
  // Typed out in full.
  assert.deepEqual(enter('/search on'), { run: '/search on' });
  assert.deepEqual(enter('/help'), { run: '/help' });
});

test('Return completes a command that takes an argument, so it can be typed', () => {
  assert.deepEqual(enter('/mo'), { complete: '/model ' });
  assert.deepEqual(enter('/re'), { complete: '/reasoning ' });
  assert.deepEqual(enter('/se'), { complete: '/search ' });
  assert.deepEqual(enter('/'), { complete: '/model ' });
});

test('Return runs a highlighted command that takes no argument', () => {
  const listed = getSlashSuggestions('/', MODELS);
  const help = listed.findIndex((s) => s.insert.trim() === '/help');
  assert.deepEqual(slashEnterAction('/', listed, help), { run: '/help' });
});

test('Return completes one of several whole commands rather than guess', () => {
  assert.deepEqual(enter('/reasoning '), { complete: '/reasoning none ' });
  assert.deepEqual(enter('/model '), { complete: '/model openrouter/mixtral ' });
});

test('Return does nothing to the list when there is none', () => {
  assert.equal(slashEnterAction('hello', [], 0), null);
});
