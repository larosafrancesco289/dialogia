import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToPlainText, plainExcerpt } from './plainText';

test('an excerpt is the opening words on one line, without syntax', () => {
  assert.equal(
    plainExcerpt('## Plan\n\n**Step one:** mix the\nbatter.'),
    'Plan Step one: mix the batter.',
  );
});

test('a long excerpt ends at a word, with an ellipsis', () => {
  const excerpt = plainExcerpt('word '.repeat(40), 30);
  assert.ok(excerpt.endsWith('word…'), excerpt);
  assert.ok(excerpt.length <= 31);
});

test('emphasis, strikethrough and inline code lose their markers', () => {
  assert.equal(
    markdownToPlainText('A **1% defect rate** is *low*, __very__ ~~not~~ `rare`.'),
    'A 1% defect rate is low, very not rare.',
  );
});

test('headings, quotes, bullets and rules read as prose', () => {
  assert.equal(
    markdownToPlainText('## Results ##\n\n> Quoted **line**\n\n- one\n  * two\n\n---\n\n1. first'),
    'Results\n\nQuoted line\n\n• one\n  • two\n\n1. first',
  );
});

test('links and images keep their words, not their targets', () => {
  assert.equal(
    markdownToPlainText(
      'See [the docs](https://x.dev/a) and ![a chart](c.png) or <https://x.dev>.',
    ),
    'See the docs and a chart or https://x.dev.',
  );
});

test('code blocks keep their text and drop the fences', () => {
  assert.equal(
    markdownToPlainText('Run:\n\n```sh\necho **not bold** # kept\n```\n\nDone.'),
    'Run:\n\necho **not bold** # kept\n\nDone.',
  );
});

test('tables lose their pipes and divider row', () => {
  assert.equal(markdownToPlainText('| a | **b** |\n|---|:--:|\n| 1 | 2 |'), 'a   b\n\n1   2');
});

test('arithmetic and snake_case are not emphasis', () => {
  assert.equal(
    markdownToPlainText('2 * 3 * 4 and my_var_name stay'),
    '2 * 3 * 4 and my_var_name stay',
  );
});
