import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toSpeakableText, type SpeechLabels } from '@/lib/speech/text';

const LABELS: SpeechLabels = {
  codeSkipped: 'Code block omitted.',
  diagramSkipped: 'Diagram omitted.',
  greekLetters: 'names',
  math: {
    over: 'over',
    squared: 'squared',
    cubed: 'cubed',
    toThePowerOf: 'to the power of',
    squareRootOf: 'square root of',
    cubeRootOf: 'cube root of',
    nthRootOf: '{index}th root of',
    times: 'times',
    dividedBy: 'divided by',
    plus: 'plus',
    minus: 'minus',
    plusOrMinus: 'plus or minus',
    equals: 'equals',
    notEqual: 'is not equal to',
    lessThan: 'is less than',
    greaterThan: 'is greater than',
    lessOrEqual: 'is less than or equal to',
    greaterOrEqual: 'is greater than or equal to',
    approximately: 'is approximately',
    infinity: 'infinity',
    degrees: 'degrees',
  },
};

describe('toSpeakableText', () => {
  it('turns headings, paragraphs, and list items into separate punctuated lines', () => {
    const md = [
      '## Key ideas',
      '',
      'First **bold** and *italic* sentence',
      'across two lines.',
      '',
      '- [x] First item',
      '2. Second item!',
    ].join('\n');

    assert.equal(
      toSpeakableText(md, LABELS),
      [
        'Key ideas.',
        'First bold and italic sentence across two lines.',
        'First item.',
        'Second item!',
      ].join('\n'),
    );
  });

  it('announces code blocks and Mermaid diagrams while reading math fences and inline code', () => {
    const md = [
      'Use `const x = 1` here.',
      '',
      '```ts',
      'export const x = 1;',
      '```',
      '',
      '```mermaid',
      'graph TD; A-->B;',
      '```',
      '',
      '```latex',
      'E = m c^2',
      '```',
    ].join('\n');

    assert.equal(
      toSpeakableText(md, LABELS),
      [
        'Use const x = 1 here.',
        'Code block omitted.',
        'Diagram omitted.',
        'E equals m c squared.',
      ].join('\n'),
    );
  });

  it('reads Markdown tables row by row with column headers', () => {
    const md = [
      '| City | Temp |',
      '| --- | ---: |',
      '| Athens | $25^\\circ$ |',
      '| Rome | `22 C` |',
    ].join('\n');

    assert.equal(
      toSpeakableText(md, LABELS),
      ['City: Athens, Temp: 25 degrees.', 'City: Rome, Temp: 22 C.'].join('\n'),
    );
  });

  it('strips citations, link-only parentheticals, and machine blocks, and shortens bare URLs', () => {
    const md = [
      '<think>internal reasoning</think>The earth orbits the sun [1][2] ([NASA](https://nasa.gov/earth)).',
      '',
      'See [the guide][g] or https://docs.example.com/guide/start.',
      '',
      '[g]: https://docs.example.com/guide',
    ].join('\n');

    assert.equal(
      toSpeakableText(md, LABELS),
      ['The earth orbits the sun.', 'See the guide or docs.example.com.'].join('\n'),
    );
  });

  it('reads inline and display math while leaving currency amounts untouched', () => {
    const md = [
      'It costs $5 or $10, while $a^2 + b^2 = c^2$ holds.',
      '',
      '$$\\frac{1}{2}$$',
    ].join('\n');

    assert.equal(
      toSpeakableText(md, LABELS),
      [
        'It costs $5 or $10, while a squared plus b squared equals c squared holds.',
        '1 over 2.',
      ].join('\n'),
    );
  });
});
