import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownRenderBlocks, rendersAsBlocks, splitMarkdownBlocks } from './blocks';

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

test('splitMarkdownBlocks keeps \\[ \\] display math with blank lines in one block', () => {
  const content = 'Intro\n\n\\[\na = b\n\nc = d\n\\]\n\nAfter\n';
  const { stable } = roundtrip(content);
  assert.equal(stable[1], '\\[\na = b\n\nc = d\n\\]\n\n');
});

test("splitMarkdownBlocks keeps a list item's indented paragraphs in the list", () => {
  const content = '- a\n\n  para in a\n\n- b\n\nend';
  const { stable, tail } = roundtrip(content);
  assert.deepEqual(stable, ['- a\n\n  para in a\n\n- b\n\n']);
  assert.equal(tail, 'end');
});

// A reply as a model streams it: headings, a table, a loose list, fenced code
// and display math with blank lines inside, a quote, citations.
const REPLY = [
  '# Answer',
  '',
  'Intro with a citation [1] and a price of $5.',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '1. one',
  '',
  '   more about one',
  '',
  '2. two',
  '',
  '```python',
  'def f():',
  '',
  '    return 1',
  '```',
  '',
  '$$',
  'a = b',
  '',
  'c = d',
  '$$',
  '',
  '> quote',
  '',
  'Closing with [2].',
].join('\n');

test('a block keeps its key and content from the flush that completes it to the finished reply', () => {
  const finished = markdownRenderBlocks(REPLY);
  assert.equal(finished.join(''), REPLY);
  // Every flush, in uneven chunks like a real stream.
  for (let end = 1; end <= REPLY.length; end += 1 + (end % 7)) {
    const flush = markdownRenderBlocks(REPLY.slice(0, end));
    // Blocks before the last two are finished: the tail may still grow, and
    // the block before it may still take a continuation (a list's next item).
    for (let index = 0; index < flush.length - 2; index += 1) {
      assert.equal(finished[index], flush[index], `block ${index} changed after flush at ${end}`);
    }
  }
});

test('the end of the stream renders the blocks the last flush rendered', () => {
  // The stored reply is the streamed text, trimmed: the same blocks under the
  // same keys, the last one at most losing trailing blank lines.
  const streamed = `${REPLY}\n\n`;
  const lastFlush = markdownRenderBlocks(streamed);
  const finished = markdownRenderBlocks(streamed.trim());
  assert.equal(finished.length, lastFlush.length);
  assert.deepEqual(finished.slice(0, -1), lastFlush.slice(0, -1));
  assert.equal(finished.at(-1), lastFlush.at(-1)?.trimEnd());
});

test('the tail keeps its key when it becomes a completed block', () => {
  const growing = markdownRenderBlocks('First.\n\nSecond is grow');
  const grown = markdownRenderBlocks('First.\n\nSecond is grown.\n\nThird');
  assert.equal(growing.length, 2);
  assert.equal(grown[1], 'Second is grown.\n\n');
  assert.equal(grown.length, 3);
});

test('rendersAsBlocks: a definition another block could use needs the whole document', () => {
  assert.equal(rendersAsBlocks(REPLY), true);
  assert.equal(rendersAsBlocks('See [x](https://x.test) and [1].'), true);
  assert.equal(rendersAsBlocks('See [the docs][d].\n\n[d]: https://docs.test'), false);
  assert.equal(rendersAsBlocks('Claim.[^1]\n\n[^1]: The source.'), false);
});
