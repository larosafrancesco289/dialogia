import test from 'node:test';
import assert from 'node:assert/strict';
import { mapOutsideCode, normalizeMathDelimiters, preprocessMarkdown } from './preprocess';
import { escapeCurrency } from './citations';

test('inline \\( \\) becomes $ $', () => {
  assert.equal(
    normalizeMathDelimiters('For \\(ax^2+bx+c=0\\), where \\( a \\ne 0 \\),'),
    'For $ax^2+bx+c=0$, where $a \\ne 0$,',
  );
});

test('display \\[ \\] on its own lines becomes a $$ block', () => {
  assert.equal(
    normalizeMathDelimiters('Then\n\n\\[\nx=\\frac{-b}{2a}.\n\\]\n\nSo'),
    'Then\n\n$$\nx=\\frac{-b}{2a}.\n$$\n\nSo',
  );
  assert.equal(normalizeMathDelimiters('\\[ E = mc^2 \\]'), '$$\nE = mc^2\n$$');
});

test('display math inside a list item keeps the item indent', () => {
  assert.equal(
    normalizeMathDelimiters('- Area:\n  \\[ \\pi r^2 \\]\n- Next'),
    '- Area:\n  $$\n  \\pi r^2\n  $$\n- Next',
  );
});

test('mid-sentence display math stays inline', () => {
  assert.equal(normalizeMathDelimiters('so \\[x=1\\] holds'), 'so $$x=1$$ holds');
});

test('a LaTeX line break with spacing is not a delimiter', () => {
  const aligned = '$$\n\\begin{aligned} a &= b \\\\[4pt] c &= d \\end{aligned}\n$$';
  assert.equal(normalizeMathDelimiters(aligned), aligned);
});

test('currency is escaped, but numbers that open math are not', () => {
  assert.equal(
    escapeCurrency('from $5 to $1,000.50 or $2M.'),
    'from \\$5 to \\$1,000.50 or \\$2M.',
  );
  assert.equal(
    escapeCurrency('there are $2^n$ subsets and $2$ halves'),
    'there are $2^n$ subsets and $2$ halves',
  );
  assert.equal(escapeCurrency('$x_1$ and $\\frac{1}{2}$'), '$x_1$ and $\\frac{1}{2}$');
});

test('a number opening a spaced formula is math, and a second price never closes a first', () => {
  const formula = 'No. $391 = 17 \\times 23$, so it is composite.';
  assert.equal(escapeCurrency(formula), formula);
  assert.equal(escapeCurrency('$3 + 4 = 7$'), '$3 + 4 = 7$');
  assert.equal(escapeCurrency('from $5 = cheap to $10'), 'from \\$5 = cheap to \\$10');
  assert.equal(escapeCurrency('$5 and $10'), '\\$5 and \\$10');
  assert.equal(escapeCurrency('$5 or $x$'), '\\$5 or $x$');
  assert.equal(escapeCurrency('pay $20 - $30 total'), 'pay \\$20 - \\$30 total');
  assert.equal(escapeCurrency('$5 each\n$x = 1$'), '\\$5 each\n$x = 1$');
});

test('fenced code and inline code pass through untouched', () => {
  const sources = [{ url: 'https://example.com/a' }];
  const content = [
    'Costs $5 per run [1], see `arr[1]` and `$1`.',
    '',
    '```bash',
    'echo $1 \\(x\\) [1]',
    '```',
    '',
    '~~~',
    'price = "$5"',
    '~~~',
    'After \\(y\\).',
  ].join('\n');
  assert.equal(
    preprocessMarkdown(content, sources),
    [
      'Costs \\$5 per run [1](<https://example.com/a>), see `arr[1]` and `$1`.',
      '',
      '```bash',
      'echo $1 \\(x\\) [1]',
      '```',
      '',
      '~~~',
      'price = "$5"',
      '~~~',
      'After $y$.',
    ].join('\n'),
  );
});

test('an unclosed fence (a streaming tail) keeps the rest as code', () => {
  assert.equal(
    mapOutsideCode('a\n```\n$5', (s) => s.toUpperCase()),
    'A\n```\n$5',
  );
});

test('unmatched backticks are literal and do not swallow prose', () => {
  assert.equal(
    mapOutsideCode('a ` b `` c', (s) => s.toUpperCase()),
    'A ` B `` C',
  );
});
