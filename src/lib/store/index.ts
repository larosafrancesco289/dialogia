'use client';
import { createWithEqualityFn } from 'zustand/traditional';
import { persist } from 'zustand/middleware';
import type { PersistedStoreState, StoreState } from '@/lib/store/types';
import { buildStoreInitializer } from '@/lib/store/createStore';
import { migrate } from '@/lib/store/migrations';
import { STORE_MIGRATION_VERSION } from '@/lib/store/versions';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';

export const PERSISTED_STORE_KEY = 'dialogia-ui';

export const useChatStore = createWithEqualityFn<StoreState>()(
  persist<StoreState, [], [], PersistedStoreState>(buildStoreInitializer(), {
    name: PERSISTED_STORE_KEY,
    version: STORE_MIGRATION_VERSION,
    migrate,
    merge: (persistedState, currentState) =>
      mergePersistedState(currentState, (persistedState ?? {}) as PersistedStoreState),
    // Persist only durable preferences; session-scoped flags (next*) are intentionally omitted.
    partialize: buildPersistedState,
  }),
);
