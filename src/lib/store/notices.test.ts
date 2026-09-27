import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDroppedAttachments } from '@/lib/store/notices';

test('left-out attachments read as a sentence, in the right number', () => {
  const tail = 'left out: this model does not accept them.';
  assert.equal(describeDroppedAttachments(['audio']), `Audio was ${tail}`);
  assert.equal(describeDroppedAttachments(['image']), `Images were ${tail}`);
  assert.equal(describeDroppedAttachments(['pdf']), `PDFs were ${tail}`);
  assert.equal(describeDroppedAttachments(['image', 'audio']), `Images and audio were ${tail}`);
  assert.equal(
    describeDroppedAttachments(['image', 'audio', 'pdf']),
    `Images, audio and PDFs were ${tail}`,
  );
});
