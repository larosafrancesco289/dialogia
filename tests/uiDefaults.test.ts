import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultUIState, resetEphemeralUi } from '@/lib/ui/defaults';
import type { UIState, PersistedStoreState } from '@/lib/store/types';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';
import { createTestStore } from './helpers/createTestStoreState';

test('buildDefaultUIState applies overrides without mutating defaults', () => {
  const base = buildDefaultUIState();
  const overridden = buildDefaultUIState({
    debug: { mode: true },
    tutor: { forceMode: true },
  });

  assert.equal(base.debug.mode, false);
  assert.equal(overridden.debug.mode, true);
  assert.equal(base.tutor?.forceMode, false);
  assert.equal(overridden.tutor?.forceMode, true);
});

test('resetEphemeralUi clears staged next values', () => {
  const state: UIState = {
    ...buildDefaultUIState(),
    overrides: {
      modelId: 'test-model',
      search: { enabled: true },
      tutorMode: true,
    },
    tutor: { ...buildDefaultUIState().tutor, forceMode: true },
  };

  const reset = resetEphemeralUi(state);
  assert.equal(reset.overrides, undefined);
  assert.equal(reset.tutor?.forceMode, true);
});

test('a fresh profile has not seen the intro tour', () => {
  assert.equal(createTestStore().getState().ui.introSeen, false);
});

test('dismissing the tour persists and survives a round-trip', () => {
  const store = createTestStore();
  store.getState().setUI({ introSeen: true });
  assert.equal(store.getState().ui.introSeen, true);

  const persisted = buildPersistedState(store.getState());
  assert.equal(persisted.ui.introSeen, true);

  const rehydrated = mergePersistedState(
    createTestStore().getState(),
    persisted as PersistedStoreState,
  );
  assert.equal(rehydrated.ui.introSeen, true);
});

test('a blob written before the tour existed leaves it unseen', () => {
  const rehydrated = mergePersistedState(createTestStore().getState(), {
    ui: { showSettings: false, sidebarCollapsed: true },
  } as PersistedStoreState);
  assert.equal(rehydrated.ui.introSeen, false);
  assert.equal(rehydrated.ui.sidebarCollapsed, true);
});

test('Settings can bring the tour back after it was seen, and that survives a reload', () => {
  const store = createTestStore();
  store.getState().setUI({ introSeen: true, showSettings: true });
  store.getState().setUI({ showSettings: false, introSeen: false });

  const persisted = buildPersistedState(store.getState());
  const rehydrated = mergePersistedState(
    createTestStore().getState(),
    persisted as PersistedStoreState,
  );
  assert.equal(rehydrated.ui.introSeen, false);
});
