import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMessageRecord } from '@/lib/db';
import type { Message } from '@/lib/types';

test('sanitizeMessageRecord trims hidden content and drops empty fields', () => {
  const original: Message = {
    id: 'm1',
    chatId: 'chat1',
    role: 'assistant',
    content: 'Hi',
    createdAt: Date.now(),
    hiddenContent: '  Tutor recap  ',
    attachments: [null as any, { id: 'img1', kind: 'image', mime: 'image/png' }],
    tutor: {},
    tutorWelcome: false,
  };

  const { next, changed } = sanitizeMessageRecord(original);
  assert.equal(changed, true);
  assert.equal(next.hiddenContent, 'Tutor recap');
  assert.deepEqual(next.attachments, [{ id: 'img1', kind: 'image', mime: 'image/png' }]);
  assert.equal('tutor' in next, false);
  assert.equal('tutorWelcome' in next, false);
  assert.equal(original.hiddenContent, '  Tutor recap  ');
});
