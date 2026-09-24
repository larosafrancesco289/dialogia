import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';
import type { PersistedStoreState } from '@/lib/store/types';
import { createTestStore } from './helpers/createTestStoreState';

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
