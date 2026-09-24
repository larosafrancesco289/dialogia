import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat } from '@/lib/messages/indexing';
import { createTestStoreState } from './helpers/createTestStoreState';

function mimeOf(dataUrl: string): string | undefined {
  const assistant = createAssistantMessage({ chatId: 'c1', content: '', createdAt: 1 });
  const { state, set, get } = createTestStoreState();
  Object.assign(state, appendMessagesToChat(state, 'c1', [assistant]));
  const callbacks = createMessageStreamCallbacks(
    { chatId: 'c1', assistantMessage: assistant, set, get, persistMessage: async () => {} },
    { startedAt: 0 },
  );
  callbacks.onImage?.(dataUrl);
  return state.messagesById[assistant.id]?.attachments?.[0]?.mime;
}

test('a generated image takes its MIME type from the data URL', () => {
  assert.equal(mimeOf('data:image/jpeg;base64,AAAA'), 'image/jpeg');
  assert.equal(mimeOf('data:image/svg+xml;charset=utf-8,%3Csvg%3E'), 'image/svg+xml');
});

test('a data URL without parameters still yields its MIME type', () => {
  assert.equal(mimeOf('data:image/svg+xml,%3Csvg%3E%3C/svg%3E'), 'image/svg+xml');
});

test('a data URL with no MIME type falls back to PNG', () => {
  assert.equal(mimeOf('data:;base64,AAAA'), 'image/png');
  assert.equal(mimeOf('data:,AAAA'), 'image/png');
});
