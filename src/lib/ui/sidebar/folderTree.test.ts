import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFolderTreeIndex, getFolderChildren } from '@/lib/ui/sidebar/folderTree';
import type { Chat, ChatSettings, Folder } from '@/lib/types';

const BASE_CHAT_SETTINGS: ChatSettings = {
  modelId: 'openai/gpt-4o-mini',
  generation: {},
  ui: {
    showThinkingByDefault: false,
    showStats: false,
    showToolCallLog: false,
    showDebugRawJson: true,
  },
  features: {
    search: {
      enabled: false,
      provider: 'openrouter',
    },
    tutor: {
      enabled: false,
    },
  },
};

const chat = (overrides: Partial<Chat>): Chat => ({
  id: overrides.id ?? 'chat-1',
  title: overrides.title ?? 'Chat',
  createdAt: overrides.createdAt ?? 1,
  updatedAt: overrides.updatedAt ?? 1,
  settings: overrides.settings ?? BASE_CHAT_SETTINGS,
  folderId: overrides.folderId,
});

const folder = (overrides: Partial<Folder>): Folder => ({
  id: overrides.id ?? 'folder-1',
  name: overrides.name ?? 'Folder',
  createdAt: overrides.createdAt ?? 1,
  updatedAt: overrides.updatedAt ?? 1,
  isExpanded: overrides.isExpanded ?? true,
  parentId: overrides.parentId,
});

test('buildFolderTreeIndex sorts chats by recency per folder', () => {
  const chats: Chat[] = [
    chat({ id: 'root-old', updatedAt: 3, createdAt: 1 }),
    chat({ id: 'root-newer', updatedAt: 7, createdAt: 2 }),
    chat({ id: 'root-newest', updatedAt: 7, createdAt: 4 }),
    chat({ id: 'nested-a', folderId: 'folder-a', updatedAt: 2, createdAt: 2 }),
    chat({ id: 'nested-b', folderId: 'folder-a', updatedAt: 5, createdAt: 3 }),
  ];
  const folders: Folder[] = [folder({ id: 'folder-a' })];

  const index = buildFolderTreeIndex(folders, chats);

  const rootChildren = getFolderChildren(index);
  assert.deepEqual(
    rootChildren.chats.map((entry) => entry.id),
    ['root-newest', 'root-newer', 'root-old'],
  );

  const nestedChildren = getFolderChildren(index, 'folder-a');
  assert.deepEqual(
    nestedChildren.chats.map((entry) => entry.id),
    ['nested-b', 'nested-a'],
  );
});

test('getFolderChildren returns indexed folders/chats without full-array filtering', () => {
  const folders: Folder[] = [
    folder({ id: 'root-a', name: 'Root A' }),
    folder({ id: 'root-b', name: 'Root B' }),
    folder({ id: 'child-a', name: 'Child A', parentId: 'root-a' }),
  ];
  const chats: Chat[] = [
    chat({ id: 'chat-root', title: 'Root chat', updatedAt: 10 }),
    chat({ id: 'chat-child', title: 'Child chat', folderId: 'root-a', updatedAt: 8 }),
  ];

  const index = buildFolderTreeIndex(folders, chats);

  const rootChildren = getFolderChildren(index);
  assert.deepEqual(
    rootChildren.folders.map((entry) => entry.id),
    ['root-a', 'root-b'],
  );
  assert.deepEqual(
    rootChildren.chats.map((entry) => entry.id),
    ['chat-root'],
  );

  const rootAFolderChildren = getFolderChildren(index, 'root-a');
  assert.deepEqual(
    rootAFolderChildren.folders.map((entry) => entry.id),
    ['child-a'],
  );
  assert.deepEqual(
    rootAFolderChildren.chats.map((entry) => entry.id),
    ['chat-child'],
  );

  const missingChildren = getFolderChildren(index, 'missing-folder');
  assert.deepEqual(missingChildren.folders, []);
  assert.deepEqual(missingChildren.chats, []);
});
