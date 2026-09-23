import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BASE_SYSTEM,
  LEGACY_BASE_SYSTEMS,
  upgradeLegacyBaseSystem,
} from '@/lib/agent/prompts/baseSystem';
import { createRepository, type DialogiaDbLike } from '@/lib/db/repository';
import { migrateChatSettingsRecord } from '@/lib/settings/migrations';
import { mergePersistedUiState } from '@/lib/store/uiPersistence';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import type { Chat } from '@/lib/types';

const LEGACY = LEGACY_BASE_SYSTEMS[0];
const EDITED = `${LEGACY}\n\nAlways answer in French.`;

test('only an exact old default is upgraded; anything edited is left alone', () => {
  assert.equal(upgradeLegacyBaseSystem(LEGACY), DEFAULT_BASE_SYSTEM);
  assert.equal(upgradeLegacyBaseSystem(EDITED), EDITED);
  assert.equal(upgradeLegacyBaseSystem(''), '');
  assert.equal(upgradeLegacyBaseSystem(undefined), undefined);
});

test('chat settings records carrying the old default migrate to the current one', () => {
  const { next, changed } = migrateChatSettingsRecord({ modelId: 'm', system: LEGACY });
  assert.equal((next as { system?: string }).system, DEFAULT_BASE_SYSTEM);
  assert.equal(changed, true);
});

test('saved chat defaults with the old default upgrade on rehydrate', () => {
  const upgraded = mergePersistedUiState(buildDefaultUIState(), {
    chatDefaults: { system: LEGACY, modelId: 'm' },
  });
  assert.equal(upgraded.chatDefaults?.system, DEFAULT_BASE_SYSTEM);
  assert.equal(upgraded.chatDefaults?.modelId, 'm');

  const kept = mergePersistedUiState(buildDefaultUIState(), { chatDefaults: { system: EDITED } });
  assert.equal(kept.chatDefaults?.system, EDITED);
});

test('stored chats pick up the current default on load without touching edited ones', async () => {
  const makeChat = (id: string, system: string) =>
    ({ id, title: id, createdAt: 1, updatedAt: 1, settings: { modelId: 'm', system } }) as Chat;
  const chats = [makeChat('old', LEGACY), makeChat('mine', EDITED)];
  const table = <T>(rows: T[]) => ({
    put: async () => {},
    delete: async () => {},
    get: async (id: string) => rows.find((row) => (row as { id: string }).id === id),
    toArray: async () => rows,
  });
  const repository = createRepository({
    chats: table(chats),
    messages: table([]),
    folders: table([]),
  } as unknown as DialogiaDbLike);

  const snapshot = await repository.loadRepositorySnapshot();
  const byId = Object.fromEntries(snapshot.chats.map((chat) => [chat.id, chat.settings.system]));
  assert.equal(byId.old, DEFAULT_BASE_SYSTEM);
  assert.equal(byId.mine, EDITED);

  const { chat } = await repository.getChatWithMessages('old');
  assert.equal(chat?.settings.system, DEFAULT_BASE_SYSTEM);
});
