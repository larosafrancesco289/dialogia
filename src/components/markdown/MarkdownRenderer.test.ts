// A finished reply stays rendered block by block (so the end of its stream
// rebuilds nothing), which is only right if that reads exactly like the whole
// document parsed at once. Rendered to static HTML and compared.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import type { MarkdownCitationSource } from '@/lib/markdown/citations';
import { markdownRenderBlocks, rendersAsBlocks } from '@/lib/markdown/blocks';

const render = (content: string, sources?: MarkdownCitationSource[]) =>
  renderToStaticMarkup(createElement(MarkdownRenderer, { content, sources }));

// Each block has its own `.markdown` wrapper and its own heading-id prefix
// (ids stay unique across blocks); neither changes what is read.
const normalize = (html: string) =>
  html
    .replace(/<div class="markdown">/g, '')
    .replace(/<\/div>/g, '')
    .replace(/(id="|href="#)[a-zA-Z0-9]*-/g, '$1')
    .replace(/>\s+</g, '><')
    .trim();

const sources = [
  { url: 'https://one.test', title: 'One' },
  { url: 'https://two.test', title: 'Two' },
];

const REPLIES: Record<string, string> = {
  mixed: [
    '# Answer',
    '',
    'Intro citing [1], a price of $5 and $x^2$.',
    '',
    '## Table',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '1. one',
    '',
    '2. two',
    '   continued',
    '',
    '- bullet',
    '  - nested',
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
    '>',
    '> more',
    '',
    '    indented code',
    '',
    'Closing with [2], **bold**, ~~strike~~ and https://autolink.test.',
    '',
    '- [ ] task',
    '- [x] done',
  ].join('\n'),
  looseList: '- a\n\n  para in a\n\n- b\n\n      code in b\n\nend',
  numbering: 'Text\n\n3. starts at three\n4. four\n\nPara\n\n5. five',
  rules: 'para\n\n---\n\nSetext\n---\n\n***\n\nend',
  tables: 'Intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n| c | d |\n|---|---|\n| 3 | 4 |\n\nend',
  bracketMath: 'Solve:\n\n\\[\nx = 1\n\n+ 2\n\\]\n\nDone \\(y\\).',
  quotes: '> quote line\ncontinued lazily\n\n> second\n\nend',
};

for (const [name, reply] of Object.entries(REPLIES)) {
  test(`a finished reply reads the same block by block as whole (${name})`, () => {
    assert.equal(rendersAsBlocks(reply), true);
    const whole = render(reply, sources);
    const blocks = markdownRenderBlocks(reply)
      .map((block) => render(block, sources))
      .join('');
    assert.equal(normalize(blocks), normalize(whole));
  });
}

test('a reply with a definition is one another block could need, so it is parsed whole', () => {
  const reply = 'See [the docs][d].\n\nMore text.\n\n[d]: https://docs.test';
  assert.equal(rendersAsBlocks(reply), false);
  const blocks = markdownRenderBlocks(reply)
    .map((block) => render(block))
    .join('');
  // Which is why: split, the reference would not resolve.
  assert.notEqual(normalize(blocks), normalize(render(reply)));
});
