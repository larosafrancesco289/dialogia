import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separateSummaryParts } from '@/lib/openrouter/stream';

test('a summary part after a finished sentence starts a new paragraph', () => {
  assert.equal(
    separateSummaryParts('.', '**Checking the base rate**'),
    '\n\n**Checking the base rate**',
  );
  assert.equal(separateSummaryParts('!', '**Next**'), '\n\n**Next**');
});

test('bold inside a sentence, or at the very start, is left alone', () => {
  assert.equal(separateSummaryParts(' ', '**key** idea'), '**key** idea');
  assert.equal(separateSummaryParts('', '**Title**'), '**Title**');
  assert.equal(separateSummaryParts('\n', '**Title**'), '**Title**');
  assert.equal(separateSummaryParts('.', ' and more'), ' and more');
});
