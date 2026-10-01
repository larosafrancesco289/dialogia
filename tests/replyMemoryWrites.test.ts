import test from 'node:test';
import assert from 'node:assert/strict';
import { dropsMemoryWrites } from '@/lib/messages/versions';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import type { MemoryWrite, Message } from '@/lib/types';

const write = (undone = false): MemoryWrite => ({
  noteId: 'n1',
  action: 'added',
  text: 'Vegetarian',
  folderId: 'about-you',
  ...(undone ? { undone: true } : {}),
});

const reply = (fields: Partial<Message>): Message => ({
  ...createAssistantMessage({ chatId: 'c1', content: 'Hi', createdAt: 1 }),
  ...fields,
});

test('dropping a reply that changed memory is noticed, an undone change is not', () => {
  assert.equal(dropsMemoryWrites(reply({ memoryWrites: [write()] })), true);
  assert.equal(dropsMemoryWrites(reply({ memoryWrites: [write(true)] })), false);
  assert.equal(dropsMemoryWrites(reply({})), false);
});

test('only the shown version counts when only it is dropped', () => {
  const other = { ...reply({ memoryWrites: [write()] }) };
  const withOther = reply({ versions: [other], versionIndex: 1 });
  assert.equal(dropsMemoryWrites(withOther), true, 'all versions go on an edit');
  assert.equal(dropsMemoryWrites(withOther, true), false, 'the shown one saved nothing');
});
