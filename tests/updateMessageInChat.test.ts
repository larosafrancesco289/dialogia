import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { buildMessageIndex } from '@/lib/messages/indexing';
import { createTestStoreState } from './helpers/createTestStoreState';

const baseState = (messages: Record<string, Message[]>): StoreState => {
  const { state } = createTestStoreState();
  const { messagesById, messageIdsByChatId } = buildMessageIndex(messages);
  return { ...state, messagesById, messageIdsByChatId };
};

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  chatId: 'chat-1',
  role: 'assistant',
  content: 'Hello',
  createdAt: Date.now(),
  toolCalls: [],
  ...overrides,
});

test('updateMessageById merges patches immutably', () => {
  const original = createMessage({ attachments: [] });
  const state = baseState({ 'chat-1': [original] });
  const patch: Partial<Message> = {
    attachments: [
      {
        id: 'att-1',
        kind: 'image',
        name: 'diagram.png',
        mime: 'image/png',
        size: 1234,
        dataURL: 'data:image/png;base64,xyz',
      },
    ],
    metrics: {
      completionMs: 1200,
      promptTokens: 32,
      completionTokens: 64,
      tokensPerSec: 12.5,
      ttftMs: 180,
    },
  };
  const result =
    updateMessageById(state, 'chat-1', original.id, (message) => ({
      ...message,
      ...patch,
    })) ?? {};

  const updated = result.messagesById?.[original.id] as Message;
  assert.ok(updated);
  assert.equal(updated.attachments?.length, 1);
  assert.equal(updated.metrics?.completionMs, 1200);
  assert.equal(updated.metrics?.promptTokens, 32);
  assert.equal(state.messagesById[original.id].attachments?.length, 0);
});

test('updateMessageById returns undefined when chat or message missing', () => {
  const state = baseState({ 'chat-1': [createMessage()] });
  const missingChat = updateMessageById(state, 'chat-x', 'm1', (message) => ({
    ...message,
    content: 'noop',
  }));
  assert.equal(missingChat, undefined);
  const missingMessage = updateMessageById(state, 'chat-1', 'missing', (message) => ({
    ...message,
    content: 'noop',
  }));
  assert.equal(missingMessage, undefined);
});
