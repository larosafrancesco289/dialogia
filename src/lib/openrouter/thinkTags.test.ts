import test from 'node:test';
import assert from 'node:assert/strict';
import { createThinkSplitter, stripThinkBlock } from './thinkTags';

const run = (chunks: string[]) => {
  const splitter = createThinkSplitter();
  let content = '';
  let reasoning = '';
  for (const piece of [...chunks.map((c) => splitter.push(c)), splitter.flush()]) {
    content += piece.content;
    reasoning += piece.reasoning;
  }
  return { content, reasoning };
};

test('a leading think block goes to reasoning, even with tags split across chunks', () => {
  assert.deepEqual(run(['<thi', 'nk>\nI should', ' say hi.\n</th', 'ink>\n\nHello']), {
    content: 'Hello',
    reasoning: 'I should say hi.',
  });
  assert.deepEqual(run(['  <think>a</think>b']), { content: 'b', reasoning: 'a' });
});

test('a reply without a leading think block is untouched', () => {
  assert.deepEqual(run(['Use ', '<think>', ' tags like this']), {
    content: 'Use <think> tags like this',
    reasoning: '',
  });
  assert.deepEqual(run(['<', 'b>bold</b>']), { content: '<b>bold</b>', reasoning: '' });
  assert.deepEqual(run(['<thi']), { content: '<thi', reasoning: '' });
});

test('an unclosed think block is all reasoning', () => {
  assert.deepEqual(run(['<think>still going']), { content: '', reasoning: 'still going' });
  assert.equal(stripThinkBlock('<think>x</think>\nA title'), 'A title');
  assert.equal(stripThinkBlock('A title'), 'A title');
});
