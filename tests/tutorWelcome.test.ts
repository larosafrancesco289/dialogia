import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LearningPlan, Message } from '@/lib/types';
import { buildMessageIndex } from '@/lib/messages/indexing';
import {
  buildPlanWelcomeMessage,
  prepareTutorWelcomeMessage,
} from '@/modules/tutor/services/tutorWelcome';
import { createTestStoreState } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';
import type { Repository } from '@/lib/db/repository';

const tutorChat = () =>
  makeChat({
    title: 'Tutor Chat',
    settings: { features: { tutor: { enabled: true, defaultModelId: 'provider/model' } } },
  });

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
  const chat = tutorChat();
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
  const chat = tutorChat();
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

const planWith = (goal: string, description?: string) =>
  ({
    goal,
    generatedAt: 1,
    updatedAt: 1,
    nodes: [
      {
        id: 'bayes',
        name: 'Bayes rule',
        ...(description ? { description } : {}),
        objectives: ['Apply it'],
        prerequisites: [],
        status: 'in_progress',
      },
    ],
  }) as unknown as LearningPlan;

test('the welcome never doubles the punctuation of the text it quotes', () => {
  const text = buildPlanWelcomeMessage(
    planWith('Solve conditional probability problems.', 'Updating beliefs with evidence.'),
  );
  assert.match(text, /"Solve conditional probability problems"\. /);
  assert.match(text, /Bayes rule: Updating beliefs with evidence\. Ask/);
  assert.doesNotMatch(text, /\.\.|\."\.|\?"\./);
  assert.doesNotMatch(text, /—/);
});

test('a written welcome is frozen: the plan moving on does not rewrite it', async () => {
  const chat = tutorChat();
  const welcome = makeMessage({
    id: 'w1',
    role: 'assistant',
    createdAt: 1,
    content: 'Welcome! Share what you want to learn.',
    tutorWelcome: true,
  });
  const user = makeMessage({ id: 'u1', role: 'user', createdAt: 2, content: 'Bayes, please' });
  const { messagesById, messageIdsByChatId } = buildMessageIndex({ [chat.id]: [welcome, user] });
  const { state, set, get } = createTestStoreState({
    chats: [chat],
    selectedChatId: chat.id,
    messagesById,
    messageIdsByChatId,
    ui: { flags: { experimentalTutor: true } },
  });

  const returned = await prepareTutorWelcomeMessage({
    chatId: chat.id,
    set,
    get,
    repository: createRepositoryStub(),
  });

  assert.equal(returned, 'Welcome! Share what you want to learn.');
  assert.equal(state.messagesById.w1.content, 'Welcome! Share what you want to learn.');
});
