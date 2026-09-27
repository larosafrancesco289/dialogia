import test from 'node:test';
import assert from 'node:assert/strict';
import { replyEndingNote } from '@/lib/ui/replyEnding';

test('a reply that hit the length limit says so', () => {
  assert.equal(
    replyEndingNote({ content: 'The first half of', finishReason: 'length' }),
    'Stopped at the length limit.',
  );
});

test('a reply that finished cleanly has no note', () => {
  assert.equal(replyEndingNote({ content: 'Done.', finishReason: 'stop' }), undefined);
});

test('a cut-off reply says how it ended', () => {
  assert.equal(
    replyEndingNote({ content: 'Partial', cutOff: 'stopped' }),
    'Stopped before the end.',
  );
  assert.equal(
    replyEndingNote({ content: 'Partial', cutOff: 'failed' }),
    'Cut off by an error before the end.',
  );
});
