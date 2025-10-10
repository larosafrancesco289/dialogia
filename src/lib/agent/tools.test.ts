import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWebSearchArgs, normalizeTutorQuizPayload, parseJsonAfter } from './tools';

test('extractWebSearchArgs finds inline JSON payloads', () => {
  const content = 'Let me call web_search with {"query":"latest news","count":3}.';
  const args = extractWebSearchArgs(content);
  assert.deepEqual(args, { query: 'latest news', count: 3 });
});

test('extractWebSearchArgs unwraps function-style payloads', () => {
  const content =
    'Calling function {"name":"web_search","arguments":"{\\"query\\":\\"open router\\"}"}';
  const args = extractWebSearchArgs(content);
  assert.deepEqual(args, { query: 'open router', count: undefined });
});

test('normalizeTutorQuizPayload trims invalid ids and caps length', () => {
  const payload = {
    items: [{ id: '  ', prompt: 'One?' }, { prompt: 'Two?' }, { id: 'keep-id', prompt: 'Three?' }],
  };
  const normalized = normalizeTutorQuizPayload(payload);
  assert.ok(normalized);
  if (!normalized) throw new Error('expected normalized payload');
  assert.equal(normalized.items.length, 3);
  assert.notEqual(normalized.items[0].id, '');
  assert.equal(normalized.items[2].id, 'keep-id');
});

test('parseJsonAfter extracts nested JSON payloads', () => {
  const content = 'prefix {"name":"web_search","arguments":{"query":"mars","count":2}} suffix';
  const parsed = parseJsonAfter(content, content.indexOf('{'));
  assert.ok(parsed);
  if (!parsed) return;
  assert.equal((parsed.value as any)?.name, 'web_search');
  assert.equal((parsed.value as any)?.arguments?.query, 'mars');
});
