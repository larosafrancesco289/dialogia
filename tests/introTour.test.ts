import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { buildStoreInitializer } from '@/lib/store/createStore';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';
import type { PersistedStoreState, StoreState } from '@/lib/store/types';

const freshStore = () =>
  createStore<StoreState>(buildStoreInitializer() as unknown as StateCreator<StoreState>);

test('a fresh profile has not seen the intro tour', () => {
  assert.equal(freshStore().getState().ui.introSeen, false);
});

test('dismissing the tour persists and survives a round-trip', () => {
  const store = freshStore();
  store.getState().setUI({ introSeen: true });
  assert.equal(store.getState().ui.introSeen, true);

  const persisted = buildPersistedState(store.getState());
  assert.equal(persisted.ui.introSeen, true);

  const rehydrated = mergePersistedState(freshStore().getState(), persisted as PersistedStoreState);
  assert.equal(rehydrated.ui.introSeen, true);
});

test('a blob written before the tour existed leaves it unseen', () => {
  const rehydrated = mergePersistedState(freshStore().getState(), {
    ui: { showSettings: false, sidebarCollapsed: true },
  } as PersistedStoreState);
  assert.equal(rehydrated.ui.introSeen, false);
  assert.equal(rehydrated.ui.sidebarCollapsed, true);
});
