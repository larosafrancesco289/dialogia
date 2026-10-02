import test from 'node:test';
import assert from 'node:assert/strict';
import { replyEndingNote, replyOutcomeAnnouncement } from '@/lib/ui/replyEnding';

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
    'This reply failed.',
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

test('the end of a reply is announced by how it ended', () => {
  assert.equal(replyOutcomeAnnouncement({ finishReason: 'stop' }), 'Reply finished');
  assert.equal(replyOutcomeAnnouncement({ cutOff: 'stopped' }), 'Reply stopped');
  assert.equal(replyOutcomeAnnouncement({ cutOff: 'failed' }), 'Reply failed');
  assert.equal(replyOutcomeAnnouncement({ cutOff: 'interrupted' }), 'Reply failed');
  assert.equal(
    replyOutcomeAnnouncement({ finishReason: 'length' }),
    'Reply stopped at the length limit',
  );
  assert.equal(replyOutcomeAnnouncement(undefined), 'Reply finished');
});

test('a failed reply keeps saying why once its notice is gone', () => {
  const reason = 'That API key has expired. Add a new one in Settings › Connections.';
  assert.equal(
    replyEndingNote({ content: '', cutOff: 'failed', cutOffReason: reason }),
    `This reply failed. ${reason}`,
  );
  assert.equal(
    replyEndingNote({ content: 'Half an answer', cutOff: 'failed', cutOffReason: reason }),
    `Cut off by an error before the end. ${reason}`,
  );
  assert.equal(replyEndingNote({ content: 'Half', cutOff: 'stopped' }), 'Stopped before the end.');
});
