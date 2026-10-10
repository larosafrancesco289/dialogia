import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnTurnMessages } from '@/lib/services/turns/spawn';
import { isChatStreaming } from '@/lib/ui/streaming';
import { createRepository } from '@/lib/db/repository';
import { createMemoryDb } from '@/lib/db/memory';
import { NOTICE_SAVE_FAILED } from '@/lib/store/notices';
import { createTestStoreState } from './helpers/createTestStoreState';

test('a turn whose first save fails still runs, and its end brings the turn count down', async () => {
  const { state, set, get } = createTestStoreState();
  const repository = {
    ...createRepository(createMemoryDb()),
    saveMessages: async () => {
      throw new DOMException('quota', 'QuotaExceededError');
    },
  };

  const spawned = await spawnTurnMessages({
    chatId: 'c1',
    content: 'hi',
    primaryAttachments: [],
    activeModelIds: ['p/m'],
    set,
    get,
    repository,
  });

  assert.ok(spawned, 'the turn goes ahead');
  assert.equal(state.ui.notice, NOTICE_SAVE_FAILED);
  assert.equal(isChatStreaming(state.ui, 'c1'), true);

  spawned.markComplete();
  assert.equal(isChatStreaming(state.ui, 'c1'), false, 'never left showing Stop');
});
