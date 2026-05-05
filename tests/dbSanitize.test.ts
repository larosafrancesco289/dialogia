import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMessageRecord } from '@/lib/db/sanitize';
import type { Message } from '@/lib/types';

test('sanitizeMessageRecord trims hidden content and drops empty fields', () => {
  const original: Message = {
    id: 'm1',
    chatId: 'chat1',
    role: 'assistant',
    content: 'Hi',
    createdAt: Date.now(),
    hiddenContent: '  Tutor recap  ',
    attachments: [
      null as any,
      {
        id: 'img1',
        kind: 'image',
        mime: 'image/png',
        file: { name: 'image.png' } as unknown as File,
      },
    ],
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

test('sanitizeMessageRecord leaves legacy research traces untouched', () => {
  const trace = [{ type: 'thought', output: 'Thinking...' }];
  const original: Message = {
    id: 'm2',
    chatId: 'chat2',
    role: 'assistant',
    content: 'Final answer',
    createdAt: Date.now(),
    reasoning: JSON.stringify(trace),
  };

  const { next, changed } = sanitizeMessageRecord(original);
  assert.equal(changed, false);
  assert.equal(next.reasoning, original.reasoning);
  assert.equal(next.deepResearch, undefined);
});
