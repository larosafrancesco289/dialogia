import test from 'node:test';
import assert from 'node:assert/strict';
import { dropsMemoryWrites } from '@/lib/messages/versions';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat } from '@/lib/messages/indexing';
import { NOTICE_REPLACED_REPLY_CHANGED_MEMORY } from '@/lib/store/notices';
import type { StoreState } from '@/lib/store/types';
import type { MemoryWrite, Message } from '@/lib/types';
import { makeChat } from './helpers/makeChat';
import { createTestStore } from './helpers/createTestStoreState';

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

test('Try again in a tutor chat says the reply it replaces had changed memory', async () => {
  const store = createTestStore();
  const chat = makeChat({ id: 'c-tutor-retry' });
  const user = createUserMessage({ id: 'u1', chatId: chat.id, content: 'Teach me', createdAt: 1 });
  const answer = { ...reply({ memoryWrites: [write()] }), id: 'a1', chatId: chat.id };
  store.setState((s) => ({
    chats: [chat],
    selectedChatId: chat.id,
    ...appendMessagesToChat(s, chat.id, [user, answer]),
    // A tutor log for the chat: its record follows the transcript, so Try again replaces.
    tutorSessions: {
      [chat.id]: { events: [{}], loaded: true },
    } as unknown as StoreState['tutorSessions'],
  }));
  const notices: unknown[] = [];
  store.setState({ setNotice: (notice: unknown) => void notices.push(notice) });

  await store.getState().regenerateAssistantMessage('a1');
  assert.ok(notices.includes(NOTICE_REPLACED_REPLY_CHANGED_MEMORY));

  notices.length = 0;
  await store.getState().regenerateAssistantMessage('a1', { replace: true });
  assert.ok(
    !notices.includes(NOTICE_REPLACED_REPLY_CHANGED_MEMORY),
    "an edit's rerun said so before it asked",
  );
});

test('Try again in a chat that keeps versions says nothing about memory', async () => {
  const store = createTestStore();
  const chat = makeChat({ id: 'c-plain-retry' });
  const user = createUserMessage({ id: 'u2', chatId: chat.id, content: 'Hi', createdAt: 1 });
  const answer = { ...reply({ memoryWrites: [write()] }), id: 'a2', chatId: chat.id };
  store.setState((s) => ({
    chats: [chat],
    selectedChatId: chat.id,
    ...appendMessagesToChat(s, chat.id, [user, answer]),
  }));
  const notices: unknown[] = [];
  store.setState({ setNotice: (notice: unknown) => void notices.push(notice) });
  await store.getState().regenerateAssistantMessage('a2');
  assert.ok(!notices.includes(NOTICE_REPLACED_REPLY_CHANGED_MEMORY), 'the old reply is kept');
});
