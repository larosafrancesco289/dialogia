import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whenChatIdle } from '@/lib/store/messageSlice';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat } from '@/lib/messages/indexing';
import { isChatStreaming, setActiveTurnCount } from '@/lib/ui/streaming';
import { makeChat } from './helpers/makeChat';
import { createTestStore } from './helpers/createTestStoreState';

test('an edit rerun waits for the stopped reply to finish ending before it starts', async () => {
  const store = createTestStore();
  const chat = makeChat({ id: 'c-edit', title: 'Edit' });
  store.setState((s) => ({
    chats: [chat],
    selectedChatId: chat.id,
    ...appendMessagesToChat(s, chat.id, [
      createUserMessage({ id: 'u1', chatId: chat.id, content: 'first', createdAt: 1 }),
      createAssistantMessage({ id: 'a1', chatId: chat.id, content: 'part', createdAt: 2 }),
    ]),
    ui: setActiveTurnCount(s.ui, chat.id, 1),
  }));
  // The stopped turn takes a moment to settle (a tool's dispatch, say) before it counts itself out.
  store.setState({
    stopStreaming: () => {
      setTimeout(() => store.setState((s) => ({ ui: setActiveTurnCount(s.ui, chat.id, 0) })), 60);
    },
  });
  let streamingWhenRerun: boolean | undefined;
  store.setState({
    regenerateAssistantMessage: async () => {
      streamingWhenRerun = isChatStreaming(store.getState().ui, chat.id);
    },
  });

  await store.getState().editUserMessage('u1', 'second', { rerun: true });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(streamingWhenRerun, false, 'the rerun began only after the old turn ended');
});

test('whenChatIdle gives up after its timeout rather than wait for a turn that never ends', async () => {
  const store = createTestStore();
  store.setState((s) => ({ ui: setActiveTurnCount(s.ui, 'stuck', 1) }));
  const started = Date.now();
  await whenChatIdle(store.getState, 'stuck', 80);
  assert.ok(Date.now() - started >= 70);
});
