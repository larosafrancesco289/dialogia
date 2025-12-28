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
  const state = { messages: { c1: [message()] } };
  const result = updateMessageById(state, 'c2', 'm1', (msg) => ({
    ...msg,
    content: 'next',
  }));
  assert.equal(result, undefined);
});

test('updateMessageById returns undefined when updater makes no changes', () => {
  const state = { messages: { c1: [message()] } };
  const result = updateMessageById(state, 'c1', 'm1', (msg) => msg);
  assert.equal(result, undefined);
});

test('updateMessageById replaces the matching message', () => {
  const state = {
    messages: {
      c1: [message()],
      c2: [message({ id: 'm2', chatId: 'c2', content: 'other' })],
    },
  };
  const result = updateMessageById(state, 'c1', 'm1', (msg) => ({
    ...msg,
    content: 'updated',
  }));
  assert.ok(result);
  assert.equal(result?.messages?.c1?.[0]?.content, 'updated');
  assert.equal(result?.messages?.c2, state.messages.c2);
});
