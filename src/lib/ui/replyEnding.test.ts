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

test('a reply that failed before its first word still says why it is empty', () => {
  assert.equal(
    replyEndingNote({ content: '', cutOff: 'failed' }),
    'This reply failed before it started.',
  );
  assert.equal(
    replyEndingNote({ content: '  ', cutOff: 'stopped' }),
    'Stopped before the reply began.',
  );
  // A card is the reply: it began, so no note claims otherwise.
  assert.equal(replyEndingNote({ content: '', cutOff: 'failed' }, true), undefined);
  assert.equal(replyEndingNote({ content: '' }), undefined);
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
