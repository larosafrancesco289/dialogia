import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksIncomplete } from '@/lib/agent/streaming/draft';

test('looksIncomplete treats empty and length-capped replies as unfinished', () => {
  assert.equal(looksIncomplete(''), true);
  assert.equal(looksIncomplete('   '), true);
  assert.equal(looksIncomplete('A full sentence.', 'length'), true);
});

test('looksIncomplete never asks for a retry after a refusal', () => {
  assert.equal(looksIncomplete('', 'content_filter'), false);
  assert.equal(looksIncomplete('I cannot help with that,', 'content_filter'), false);
});

test('looksIncomplete spots dangling fences, brackets and narrated tool calls', () => {
  assert.equal(looksIncomplete('Here is code:\n```ts\nconst x = 1;'), true);
  assert.equal(looksIncomplete('Consider f('), true);
  assert.equal(looksIncomplete('Let me quiz you before we proceed:'), true);
  assert.equal(looksIncomplete('Great start,'), true);
});

test('looksIncomplete accepts a finished reply', () => {
  assert.equal(looksIncomplete('Solve x + 2 = 5. What is x?'), false);
  assert.equal(looksIncomplete('```ts\nconst x = 1;\n```\nDone.'), false);
});
