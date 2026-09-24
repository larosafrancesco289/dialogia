import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMessageRecord } from '@/lib/db/sanitize';
import { createUserMessage } from '@/lib/messages/createMessage';
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

test('sanitizeMessageRecord keeps reasoning and reports no change', () => {
  const original: Message = {
    id: 'm2',
    chatId: 'chat2',
    role: 'assistant',
    content: 'Final answer',
    createdAt: Date.now(),
    reasoning: 'Thinking...',
  };

  const { next, changed } = sanitizeMessageRecord(original);
  assert.equal(changed, false);
  assert.equal(next.reasoning, original.reasoning);
});

test('sanitizeMessageRecord drops the legacy deepResearch field', () => {
  const original = {
    id: 'm3',
    chatId: 'chat3',
    role: 'assistant',
    content: 'Final answer',
    createdAt: Date.now(),
    deepResearch: { trace: [{ type: 'thought' }], answer: 'Legacy answer' },
  } as unknown as Message;

  const { next, changed } = sanitizeMessageRecord(original);
  assert.equal(changed, true);
  assert.equal('deepResearch' in next, false);
  assert.equal(next.content, 'Final answer');
});

test('sanitizeMessageRecord folds a legacy deepResearch answer into empty content', () => {
  const original = {
    id: 'm4',
    chatId: 'chat4',
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    deepResearch: { trace: [{ type: 'thought' }], answer: 'Legacy answer text' },
  } as unknown as Message;

  const { next, changed } = sanitizeMessageRecord(original);
  assert.equal(changed, true);
  assert.equal('deepResearch' in next, false);
  assert.equal(next.content, 'Legacy answer text');
});

test('sanitizeMessageRecord drops an answerless deepResearch field without touching content', () => {
  const original = {
    id: 'm5',
    chatId: 'chat5',
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    deepResearch: { trace: [{ type: 'thought' }] },
  } as unknown as Message;

  const { next, changed } = sanitizeMessageRecord(original);
  assert.equal(changed, true);
  assert.equal('deepResearch' in next, false);
  assert.equal(next.content, '');
});

test('sanitizeMessageRecord keeps well-formed tool rounds and drops malformed ones', () => {
  const call = { id: 'c1', name: 'note', arguments: '{}', result: '{"ok":true}' };
  const kept: Message = {
    id: 'm-rounds',
    chatId: 'chat-rounds',
    role: 'assistant',
    content: 'Noted.',
    createdAt: Date.now(),
    toolRounds: [{ text: 'Noted.', calls: [call] }],
  };
  const clean = sanitizeMessageRecord(kept);
  assert.equal(clean.changed, false);
  assert.deepEqual(clean.next.toolRounds, kept.toolRounds);

  const messy = {
    ...kept,
    toolRounds: [
      { text: 'Noted.', calls: [call, { id: 'c2', name: 'note' }] },
      { text: 'No calls.', calls: [] },
      'junk',
    ],
  } as unknown as Message;
  const repaired = sanitizeMessageRecord(messy);
  assert.equal(repaired.changed, true);
  assert.deepEqual(repaired.next.toolRounds, [{ text: 'Noted.', calls: [call] }]);

  const hopeless = { ...kept, toolRounds: 'nope' } as unknown as Message;
  const dropped = sanitizeMessageRecord(hopeless);
  assert.equal(dropped.changed, true);
  assert.equal('toolRounds' in dropped.next, false);
});

test('sanitizeMessageRecord keeps a ledger line and drops a malformed or misplaced flag', () => {
  const line: Message = {
    id: 'm-ledger',
    chatId: 'chat-ledger',
    role: 'user',
    content: 'Approved the plan',
    createdAt: Date.now(),
    ledger: true,
  };
  const kept = sanitizeMessageRecord(line);
  assert.equal(kept.changed, false);
  assert.equal(kept.next.ledger, true);

  const truthy = sanitizeMessageRecord({ ...line, ledger: 'yes' } as unknown as Message);
  assert.equal(truthy.changed, true);
  assert.equal('ledger' in truthy.next, false);

  const onReply = sanitizeMessageRecord({ ...line, role: 'assistant' });
  assert.equal(onReply.changed, true);
  assert.equal('ledger' in onReply.next, false);
});

test('createUserMessage marks a ledger line and leaves typed messages unmarked', () => {
  const ledger = createUserMessage({ chatId: 'c', content: 'Approved the plan', ledger: true });
  assert.equal(ledger.ledger, true);
  const typed = createUserMessage({ chatId: 'c', content: 'hello' });
  assert.equal('ledger' in typed, false);
});
