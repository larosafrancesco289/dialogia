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

test('updateMessageById returns undefined when the chat or message is missing', () => {
  const state = {
    messagesById: { m1: message() },
    messageIdsByChatId: { c1: ['m1'] },
  };
  const edit = (msg: Message) => ({ ...msg, content: 'next' });
  assert.equal(updateMessageById(state, 'c2', 'm1', edit), undefined);
  assert.equal(updateMessageById(state, 'c1', 'missing', edit), undefined);
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
  assert.equal(result?.messagesById?.m2, state.messagesById.m2);
  assert.equal(result?.messageIdsByChatId, undefined);
  // The input state is left untouched.
  assert.notEqual(result?.messagesById, state.messagesById);
  assert.equal(state.messagesById.m1.content, 'hi');
});

test('updateMessageById guards against identity changes', () => {
  const state = {
    messagesById: { m1: message() },
    messageIdsByChatId: { c1: ['m1'] },
  };
  assert.throws(() => {
    updateMessageById(state, 'c1', 'm1', (msg) => ({
      ...msg,
      id: 'm2',
    }));
  }, /cannot change message id or chatId/i);
});
