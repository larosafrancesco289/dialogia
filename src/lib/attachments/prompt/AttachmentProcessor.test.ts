import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttachmentProcessor } from '@/lib/attachments/prompt/AttachmentProcessor';
import type { PersistedAttachment } from '@/lib/types';

const pdf = (pageCount: number): PersistedAttachment => ({
  id: 'p',
  kind: 'pdf',
  name: 'a.pdf',
  mime: 'application/pdf',
  text: 'Hello',
  pageCount,
});

test('a PDF read in the browser is sent as text, its page count in the right number', () => {
  assert.deepEqual(AttachmentProcessor.process([pdf(1)]), [
    { type: 'text', text: '[Document: a.pdf] (1 page)\n\nHello' },
  ]);
  assert.deepEqual(AttachmentProcessor.process([pdf(3)]), [
    { type: 'text', text: '[Document: a.pdf] (3 pages)\n\nHello' },
  ]);
});
