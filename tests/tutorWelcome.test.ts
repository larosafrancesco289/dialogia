import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chat, Message } from '@/lib/types';
import { buildMessageIndex } from '@/lib/messages/indexing';
import { prepareTutorWelcomeMessage } from '@/lib/services/tutorWelcome';
import { createTestStoreState } from './helpers/createTestStoreState';
import type { Repository } from '@/lib/db/repository';

const makeChat = (): Chat =>
  ({
    id: 'chat-1',
    title: 'Tutor Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      model: 'provider/model',
      tutor_mode: true,
      tutor_default_model: 'provider/model',
    },
  }) as Chat;

const makeMessage = (overrides: Partial<Message>): Message =>
  ({
    id: overrides.id ?? 'm1',
    chatId: overrides.chatId ?? 'chat-1',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? 'Hello',
    createdAt: overrides.createdAt ?? Date.now(),
    ...overrides,
  }) as Message;

const createRepositoryStub = (): Repository =>
  ({ saveMessage: async () => {} }) as unknown as Repository;

test('prepareTutorWelcomeMessage replaces the first assistant before any user message', async () => {
  const chat = makeChat();
  const assistant = makeMessage({ id: 'a1', role: 'assistant', createdAt: 1 });
  const user = makeMessage({ id: 'u1', role: 'user', createdAt: 2, content: 'Hi' });
  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    [chat.id]: [assistant, user],
  });
  const { state, set, get } = createTestStoreState({
    chats: [chat],
    selectedChatId: chat.id,
    messagesById,
    messageIdsByChatId,
    ui: { flags: { experimentalTutor: true } },
  });

  await prepareTutorWelcomeMessage({
    chatId: chat.id,
    set,
    get,
    repository: createRepositoryStub(),
  });

  const ids = state.messageIdsByChatId[chat.id];
  assert.equal(ids.length, 2);
  const first = state.messagesById[ids[0]];
  const second = state.messagesById[ids[1]];
  assert.equal(first.id, assistant.id);
  assert.equal(first.tutorWelcome, true);
  assert.equal(second.id, user.id);
});

test('prepareTutorWelcomeMessage inserts before the first user message when needed', async () => {
  const chat = makeChat();
  const user = makeMessage({ id: 'u1', role: 'user', createdAt: 1, content: 'Hi' });
  const assistant = makeMessage({ id: 'a1', role: 'assistant', createdAt: 2 });
  const { messagesById, messageIdsByChatId } = buildMessageIndex({
    [chat.id]: [user, assistant],
  });
  const { state, set, get } = createTestStoreState({
    chats: [chat],
    selectedChatId: chat.id,
    messagesById,
    messageIdsByChatId,
    ui: { flags: { experimentalTutor: true } },
  });

  await prepareTutorWelcomeMessage({
    chatId: chat.id,
    set,
    get,
    repository: createRepositoryStub(),
  });

  const ids = state.messageIdsByChatId[chat.id];
  assert.equal(ids.length, 3);
  const first = state.messagesById[ids[0]];
  const second = state.messagesById[ids[1]];
  assert.equal(first.tutorWelcome, true);
  assert.equal(second.id, user.id);
});
