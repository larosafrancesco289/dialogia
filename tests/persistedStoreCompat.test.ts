import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { buildStoreInitializer } from '@/lib/store/createStore';
import {
  adoptPersistedState,
  buildPersistedState,
  mergePersistedState,
  readPersistedSnapshot,
} from '@/lib/store/persistence';
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
  // v8 dropped `contextMode` on purpose (the tutor no longer copies cards into
  // history); the tutor keys that remain are the user's preferences.
  assert.deepEqual(Object.keys(persisted.ui.tutor ?? {}).sort(), [
    'autoScroll',
    'defaultModelId',
    'forceMode',
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

test('an open Settings drawer is not restored on load', () => {
  const merged = mergePersistedState(
    freshState(),
    migrate(
      { ...preRefactorBlob, ui: { ...preRefactorBlob.ui, showSettings: true } },
      6,
    ) as PersistedStoreState,
  );
  assert.equal(merged.ui.showSettings, false);
});

test("another tab's preferences are adopted, this window's view is kept", () => {
  const current = freshState();
  current.selectedChatId = 'mine';
  current.ui = { ...current.ui, showSettings: true, sidebarCollapsed: false };
  const other = buildPersistedState({
    ...freshState(),
    selectedChatId: 'theirs',
    favoriteModelIds: ['openai/gpt-6-luna'],
    ui: { ...freshState().ui, showSettings: false, sidebarCollapsed: true, zdrOnly: true },
  });

  const adopted = adoptPersistedState(current, other);

  assert.deepEqual(adopted.favoriteModelIds, ['openai/gpt-6-luna']);
  assert.equal(adopted.ui.zdrOnly, true);
  assert.equal(adopted.selectedChatId, 'mine');
  assert.equal(adopted.ui.showSettings, true);
  assert.equal(adopted.ui.sidebarCollapsed, false);
});

test('a snapshot from another tab is read, migrated, or refused', () => {
  const state = buildPersistedState(freshState());
  const identity = (s: unknown) => s;
  const raw = (version: number) => JSON.stringify({ state, version });

  assert.deepEqual(readPersistedSnapshot(raw(8), 8, identity), JSON.parse(JSON.stringify(state)));
  assert.equal(readPersistedSnapshot(raw(9), 8, identity), undefined);
  assert.equal(readPersistedSnapshot('not json', 8, identity), undefined);
  assert.equal(readPersistedSnapshot(JSON.stringify({ version: 8 }), 8, identity), undefined);
  let migratedFrom: number | undefined;
  readPersistedSnapshot(raw(6), 8, (s, from) => {
    migratedFrom = from;
    return s;
  });
  assert.equal(migratedFrom, 6);
});
