// A fast second Enter lands while the first send is still loading the chat and
// the turn code, before the chat reads as streaming. It must not start a
// second turn.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestStore } from './helpers/createTestStoreState';

test('a second send while the first is still starting is ignored', async () => {
  const store = createTestStore();
  let loads = 0;
  let finishLoading: () => void = () => undefined;
  const loading = new Promise<void>((resolve) => {
    finishLoading = resolve;
  });
  store.setState({
    selectedChatId: 'chat-double-send',
    ensureChatMessagesLoaded: async () => {
      loads += 1;
      await loading;
    },
  });

  const first = store.getState().sendUserMessage('hello');
  const second = store.getState().sendUserMessage('hello');
  assert.equal(loads, 1, 'the second send never got past the guard');

  finishLoading();
  await Promise.all([first, second]);

  // Once the first send is done, the chat takes the next one.
  await store.getState().sendUserMessage('again');
  assert.equal(loads, 2);
});

test('sends in different chats do not hold each other up', async () => {
  const store = createTestStore();
  const loaded: string[] = [];
  let finishLoading: () => void = () => undefined;
  const loading = new Promise<void>((resolve) => {
    finishLoading = resolve;
  });
  store.setState({
    selectedChatId: 'chat-a',
    ensureChatMessagesLoaded: async (chatId: string) => {
      loaded.push(chatId);
      await loading;
    },
  });
  const inA = store.getState().sendUserMessage('one');
  store.setState({ selectedChatId: 'chat-b' });
  const inB = store.getState().sendUserMessage('two');
  finishLoading();
  await Promise.all([inA, inB]);
  assert.deepEqual(loaded, ['chat-a', 'chat-b']);
});
