import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreGetter, StoreSetter, StoreState } from '@/lib/store/types';
import { resolveNotice } from '@/lib/store/notices';

type StoreStateOverrides = Omit<Partial<StoreState>, 'ui'> & {
  ui?: Partial<StoreState['ui']>;
};

/**
 * Builds a store from the real slices, so a new field or action needs no edit here.
 * The returned `state` is a mutable plain object (not the zustand store) because the
 * units under test take `{ set, get }` and assert against the object directly.
 */
export function createTestStoreState(overrides: StoreStateOverrides = {}) {
  const initializer = buildStoreInitializer() as unknown as StateCreator<StoreState>;
  const store = createStore<StoreState>(initializer);

  const initial = store.getState();
  const state: StoreState = {
    ...initial,
    ...overrides,
    ui: {
      ...initial.ui,
      ...(overrides.ui || {}),
    },
  };

  state.setNotice = (notice?: string) => {
    state.ui.notice = resolveNotice(notice);
  };

  const set: StoreSetter = (updater) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    if (!patch) return;
    Object.assign(state, patch);
  };

  const get: StoreGetter = () => state;

  return { state, set, get };
}
