// Fences in the streaming block splitter follow CommonMark: a fence of four
// backticks is closed only by four or more, and a line with an info string
// never closes one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMarkdownBlocks } from '@/lib/markdown/blocks';

const nested = [
  'Here is a README:',
  '',
  '````markdown',
  '# Title',
  '',
  '```python',
  'print("hi")',
  '',
  'x = 1',
  '```',
  '',
  'More text.',
  '````',
  '',
  'After.',
].join('\n');

test('a four-backtick fence holds a three-backtick one, blank lines and all', () => {
  const { stable, tail } = splitMarkdownBlocks(nested);
  assert.equal(stable.join('') + tail, nested);
  assert.equal(stable.length, 2);
  assert.ok(stable[1].startsWith('````markdown'));
  assert.ok(stable[1].includes('More text.\n````\n'));
  assert.equal(tail, 'After.');
});

test('while it streams, the outer fence stays open across the inner one', () => {
  const partial = nested.slice(0, nested.indexOf('More text.'));
  const { stable, tail } = splitMarkdownBlocks(partial);
  assert.equal(stable.length, 1);
  assert.ok(tail.startsWith('````markdown'));
});

test('a fence line carrying an info string does not close an open fence', () => {
  const text = ['```', 'code', '```js', '', 'still code', '```', '', 'After.'].join('\n');
  const { stable, tail } = splitMarkdownBlocks(text);
  assert.equal(stable.length, 1);
  assert.ok(stable[0].includes('still code'));
  assert.equal(tail, 'After.');
});

test('a tilde fence is not closed by backticks', () => {
  const text = ['~~~', '```', '', 'inside', '~~~', '', 'After.'].join('\n');
  const { stable, tail } = splitMarkdownBlocks(text);
  assert.equal(stable.length, 1);
  assert.equal(tail, 'After.');
});
