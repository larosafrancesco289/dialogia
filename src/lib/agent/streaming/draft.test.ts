import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endsMidSentence, looksIncomplete } from '@/lib/agent/streaming/draft';

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
  // Ending on a word costs no retry: that judgement is only for a Stop.
  assert.equal(looksIncomplete('It was released in the spring of 2024'), false);
});

test('endsMidSentence spots prose that stops mid-sentence', () => {
  assert.equal(endsMidSentence('The answer is 42, and the reason it matters is that'), true);
  assert.equal(endsMidSentence('First, a summary.\n\nThe key point here is that the'), true);
  assert.equal(endsMidSentence('It was released in the spring of 2024'), true);
  assert.equal(endsMidSentence('Il motivo principale è che la'), true);
});

test('endsMidSentence reads lines that end on a word by design as whole', () => {
  const whole = [
    // Short answers.
    'Paris',
    '42',
    'Thanks a lot',
    // Sentences ended, also inside quotes and brackets.
    'The answer is 42.',
    'He said "it is done."',
    '(See the appendix for the details.)',
    'Hope this helps 😊',
    'Is that what you meant?',
    // Lists, headings, quotes, tables and code.
    'Steps:\n\n- Mix the flour and the water\n- Bake it for twenty minutes',
    'Steps:\n\n* Mix the flour and the water',
    'Steps:\n\n1. Mix the flour and the water\n2) Bake it for twenty minutes',
    '## The heading of this section',
    '> To be or not to be',
    '| Name | Notes |\n| --- | --- |\n| Ada | wrote the first program |',
    'Name | Notes\n--- | ---\nAda | wrote the first program ever',
    '```js\nconst answer = the value\n```',
    'Run:\n\n    bun run the test suite now',
    // Verse: lines inside one paragraph.
    'An old silent pond\nA frog jumps into the pond\nthe sound of the water',
    // A link, a version, emphasis, code or maths at the end.
    'Read more about it at https://example.com/docs',
    'It shipped with the release of version 2.1',
    '**Note the last thing here**',
    'Run the whole suite with `bun run test`',
    'And so we have $$x = y + z$$',
    // No spaces between words: too little to judge.
    '这是一个完整的回答没有标点',
  ];
  for (const text of whole) assert.equal(endsMidSentence(text), false, text);
});
