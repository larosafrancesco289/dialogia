import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateMessageById } from './updateMessageById';
import type { Message } from '@/lib/types';

const message = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  chatId: 'c1',
  role: 'assistant',
  content: 'hi',
  createdAt: 1,
  ...overrides,
});

test('updateMessageById returns undefined when chat is missing', () => {
  const state = {
    messagesById: { m1: message() },
    messageIdsByChatId: { c1: ['m1'] },
  };
  const result = updateMessageById(state, 'c2', 'm1', (msg) => ({
    ...msg,
    content: 'next',
  }));
  assert.equal(result, undefined);
});

test('updateMessageById returns undefined when updater makes no changes', () => {
  const state = {
    messagesById: { m1: message() },
    messageIdsByChatId: { c1: ['m1'] },
  };
  const result = updateMessageById(state, 'c1', 'm1', (msg) => msg);
  assert.equal(result, undefined);
});

test('updateMessageById replaces the matching message', () => {
  const state = {
    messagesById: {
      m1: message(),
      m2: message({ id: 'm2', chatId: 'c2', content: 'other' }),
    },
    messageIdsByChatId: { c1: ['m1'], c2: ['m2'] },
  };
  const result = updateMessageById(state, 'c1', 'm1', (msg) => ({
    ...msg,
    content: 'updated',
  }));
  assert.ok(result);
  assert.equal(result?.messagesById?.m1?.content, 'updated');
  assert.equal(result?.messageIdsByChatId, undefined);
});
