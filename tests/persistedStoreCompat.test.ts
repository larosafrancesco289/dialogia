import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { buildStoreInitializer } from '@/lib/store/createStore';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';
import { migrate } from '@/lib/store/migrations';
import type { PersistedStoreState, StoreState } from '@/lib/store/types';

const freshState = (): StoreState => {
  const initializer = buildStoreInitializer() as unknown as StateCreator<StoreState>;
  return createStore<StoreState>(initializer).getState();
};

/** A localStorage blob written by the pre-refactor build (persist version 6). */
const preRefactorBlob = {
  selectedChatId: 'chat-42',
  favoriteModelIds: ['anthropic/claude-3.5-sonnet'],
  hiddenModelIds: ['openai/gpt-3.5-turbo'],
  zdrModelIds: ['a/b'],
  zdrProviderIds: ['anthropic'],
  zdrFetchedAt: 1_700_000_000_000,
  ui: {
    showSettings: false,
    sidebarCollapsed: true,
    zdrOnly: true,
    messageTimestamps: true,
    dynamicDefaultResolutions: { 'dialogia/latest': 'anthropic/claude-3.5-sonnet' },
    chatDefaults: { modelId: 'anthropic/claude-3.5-sonnet' },
    flags: { experimentalTutor: true },
    debug: { mode: true },
    tutor: {
      contextMode: 'full',
      defaultModelId: 'anthropic/claude-3.5-haiku',
      forceMode: true,
      autoScroll: true,
      researchMode: 'plan_plus_model',
      studyCondition: 'B',
    },
    plan: { rightPanelOpen: true },
  },
};

test('a pre-refactor persisted blob survives migrate + merge', () => {
  const migrated = migrate(preRefactorBlob, 6) as PersistedStoreState;
  const merged = mergePersistedState(freshState(), migrated);

  assert.equal(merged.selectedChatId, 'chat-42');
  assert.deepEqual(merged.favoriteModelIds, ['anthropic/claude-3.5-sonnet']);
  assert.deepEqual(merged.hiddenModelIds, ['openai/gpt-3.5-turbo']);
  assert.deepEqual(merged.zdrModelIds, ['a/b']);
  assert.equal(merged.zdrFetchedAt, 1_700_000_000_000);

  assert.equal(merged.ui.sidebarCollapsed, true);
  assert.equal(merged.ui.zdrOnly, true);
  assert.equal(merged.ui.messageTimestamps, true);
  assert.equal(merged.ui.chatDefaults?.modelId, 'anthropic/claude-3.5-sonnet');
  assert.equal(merged.ui.flags.experimentalTutor, true);
  assert.equal(merged.ui.debug.mode, true);
  assert.equal(merged.ui.tutor?.forceMode, true);
  assert.equal(merged.ui.tutor?.defaultModelId, 'anthropic/claude-3.5-haiku');
  assert.equal(merged.ui.plan?.rightPanelOpen, true);

  // A blob written before the intro tour existed leaves the tour unseen.
  assert.equal(merged.ui.introSeen, false);

  // Ephemeral UI state must still be present after merging a partial blob.
  assert.ok(merged.ui.mobile);
  assert.ok(merged.ui.search);
});

test('partialize emits the same key set the pre-refactor build wrote', () => {
  const merged = mergePersistedState(freshState(), migrate(preRefactorBlob, 6) as never);
  const persisted = buildPersistedState(merged as StoreState);

  // `customEndpoints` is additive: Stage 3 added a key, renamed none.
  assert.deepEqual(Object.keys(persisted).sort(), [
    'customEndpoints',
    'favoriteModelIds',
    'hiddenModelIds',
    'selectedChatId',
    'ui',
    'zdrFetchedAt',
    'zdrModelIds',
    'zdrProviderIds',
  ]);
  assert.deepEqual(Object.keys(persisted.ui).sort(), [
    'chatDefaults',
    'debug',
    'dynamicDefaultResolutions',
    'flags',
    'introSeen',
    'messageTimestamps',
    'plan',
    'showSettings',
    'sidebarCollapsed',
    'tutor',
    'zdrOnly',
  ]);
});

test('a persist round-trip is stable', () => {
  const first = buildPersistedState(
    mergePersistedState(freshState(), migrate(preRefactorBlob, 6) as never) as StoreState,
  );
  const second = buildPersistedState(
    mergePersistedState(freshState(), first as PersistedStoreState) as StoreState,
  );
  assert.deepEqual(second, first);
});
