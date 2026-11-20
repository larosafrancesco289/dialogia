import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { speechChunks } from '@/lib/speech/chunks';

describe('speechChunks', () => {
  it('splits paragraphs and sentences while preserving decimals and numbers', () => {
    const input = 'Pi is 3.14 and costs 1,000 euros. Is that clear?\n\nNext line!';
    assert.deepEqual(speechChunks(input), [
      'Pi is 3.14 and costs 1,000 euros.',
      'Is that clear?',
      'Next line!',
    ]);
  });

  it('keeps closing quotes and parentheses attached to their sentence', () => {
    const input = 'She said "wait." (Really?) Then she left.';
    assert.deepEqual(speechChunks(input), ['She said "wait."', '(Really?)', 'Then she left.']);
  });

  it('splits long sentences at clause boundaries and packs short clauses together', () => {
    const input = 'First short clause, second short clause, third longer clause here, fourth end.';
    const chunks = speechChunks(input, 45);
    assert.equal(
      chunks.every((chunk) => chunk.length <= 45),
      true,
    );
    assert.equal(chunks.join(' '), input);
    assert.deepEqual(chunks, [
      'First short clause, second short clause,',
      'third longer clause here, fourth end.',
    ]);
  });

  it('falls back to word boundaries and slices overlong words when needed', () => {
    const input = 'one two supercalifragilisticexpialidocious end';
    const chunks = speechChunks(input, 12);
    assert.equal(
      chunks.every((chunk) => chunk.length <= 12),
      true,
    );
    assert.deepEqual(chunks, ['one two', 'supercalifra', 'gilisticexpi', 'alidocious', 'end']);
  });

  it('returns an empty list for blank input', () => {
    assert.deepEqual(speechChunks('   \n\n\t  '), []);
  });
});
