import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMarkdownBlocks } from './blocks';

const roundtrip = (content: string) => {
  const { stable, tail } = splitMarkdownBlocks(content);
  assert.equal(stable.join('') + tail, content, 'split must reproduce source exactly');
  return { stable, tail };
};

test('splitMarkdownBlocks returns empty for empty content', () => {
  assert.deepEqual(splitMarkdownBlocks(''), { stable: [], tail: '' });
});

test('splitMarkdownBlocks splits paragraphs and keeps last as tail', () => {
  const { stable, tail } = roundtrip('First paragraph.\n\nSecond paragraph.\n\nThird is growing');
  assert.equal(stable.length, 2);
  assert.equal(stable[0], 'First paragraph.\n\n');
  assert.equal(tail, 'Third is growing');
});

test('splitMarkdownBlocks does not split inside fenced code', () => {
  const content = 'Intro.\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nOutro paragraph';
  const { stable, tail } = roundtrip(content);
  assert.equal(stable.length, 2);
  assert.ok(stable[1].includes('const a = 1;\n\nconst b = 2;'));
  assert.equal(tail, 'Outro paragraph');
});

test('splitMarkdownBlocks keeps an unterminated fence in the tail', () => {
  const content = 'Intro.\n\n```python\nprint("hi")\n\nprint("still streaming"';
  const { stable, tail } = roundtrip(content);
  assert.equal(stable.length, 1);
  assert.ok(tail.startsWith('```python'));
});

test('splitMarkdownBlocks merges loose list items into one block', () => {
  const content = '1. First item\n\n2. Second item\n\n3. Third item\n\nClosing prose';
  const { stable, tail } = roundtrip(content);
  assert.equal(stable.length, 1);
  assert.ok(stable[0].includes('3. Third item'));
  assert.equal(tail, 'Closing prose');
});

test('splitMarkdownBlocks does not split display math', () => {
  const content = 'Before.\n\n$$\nx = 1\n\ny = 2\n$$\n\nAfter text';
  const { stable, tail } = roundtrip(content);
  assert.equal(stable.length, 2);
  assert.ok(stable[1].includes('x = 1\n\ny = 2'));
  assert.equal(tail, 'After text');
});

test('splitMarkdownBlocks treats blockquote continuations as one block', () => {
  const content = '> quoted line one\n\n> quoted line two\n\nNext paragraph';
  const { stable } = roundtrip(content);
  assert.equal(stable.length, 1);
});
