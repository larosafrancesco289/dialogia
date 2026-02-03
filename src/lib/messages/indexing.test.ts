import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMessagesToChat,
  buildMessageIndex,
  removeChatMessages,
  setMessagesForChat,
} from '@/lib/messages/indexing';
import type { Message } from '@/lib/types';

const msg = (overrides: Partial<Message>): Message => ({
  id: overrides.id ?? 'm1',
  chatId: overrides.chatId ?? 'c1',
  role: overrides.role ?? 'assistant',
  content: overrides.content ?? 'hi',
  createdAt: overrides.createdAt ?? 1,
  ...overrides,
});

test('buildMessageIndex sorts messages deterministically', () => {
  const a = msg({ id: 'a', role: 'assistant', createdAt: 1 });
  const b = msg({ id: 'b', role: 'user', createdAt: 1 });
  const c = msg({ id: 'c', role: 'assistant', createdAt: 2 });
  const { messageIdsByChatId } = buildMessageIndex({ c1: [c, a, b] });
  assert.deepEqual(messageIdsByChatId.c1, ['b', 'a', 'c']);
});

test('appendMessagesToChat is idempotent and ordered', () => {
  const first = msg({ id: 'm1', createdAt: 2 });
  const second = msg({ id: 'm2', createdAt: 1, role: 'user' });
  const state = buildMessageIndex({ c1: [first] });
  const patch = appendMessagesToChat(state, 'c1', [second, first]);
  assert.ok(patch.messageIdsByChatId?.c1);
  assert.deepEqual(patch.messageIdsByChatId?.c1, ['m2', 'm1']);

  const merged = {
    ...state,
    ...patch,
    messagesById: { ...state.messagesById, ...patch.messagesById },
    messageIdsByChatId: { ...state.messageIdsByChatId, ...patch.messageIdsByChatId },
  };
  const patchAgain = appendMessagesToChat(merged, 'c1', [second]);
  assert.deepEqual(patchAgain.messageIdsByChatId?.c1, ['m2', 'm1']);
});

test('setMessagesForChat replaces message order deterministically', () => {
  const first = msg({ id: 'm1', createdAt: 3 });
  const second = msg({ id: 'm2', createdAt: 1, role: 'user' });
  const third = msg({ id: 'm3', createdAt: 2 });
  const state = buildMessageIndex({ c1: [first] });
  const patch = setMessagesForChat(state, 'c1', [first, second, third]);
  assert.deepEqual(patch.messageIdsByChatId?.c1, ['m2', 'm3', 'm1']);
});

test('removeChatMessages clears message ids and entries', () => {
  const state = buildMessageIndex({ c1: [msg({ id: 'm1' }), msg({ id: 'm2' })] });
  const patch = removeChatMessages(state, 'c1');
  assert.deepEqual(patch.messageIdsByChatId?.c1, undefined);
  assert.equal(patch.messagesById?.m1, undefined);
  assert.equal(patch.messagesById?.m2, undefined);
});
