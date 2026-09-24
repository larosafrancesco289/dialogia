import { createWithEqualityFn } from 'zustand/traditional';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PersistedStoreState, StoreState } from '@/lib/store/types';
import { buildStoreInitializer } from '@/lib/store/createStore';
import { migrate } from '@/lib/store/migrations';
import { STORE_MIGRATION_VERSION } from '@/lib/store/versions';
import {
  adoptPersistedState,
  buildPersistedState,
  mergePersistedState,
  readPersistedSnapshot,
} from '@/lib/store/persistence';
import { connectTabSync } from '@/lib/store/tabSync';
import { tabChannel } from '@/lib/sync/tabChannel';

export const PERSISTED_STORE_KEY = 'dialogia-ui';

// Set while this tab takes in another tab's write, so it does not write the
// result straight back: two tabs would otherwise echo each other forever.
let adoptingAnotherTab = false;

export const useChatStore = createWithEqualityFn<StoreState>()(
  persist<StoreState, [], [], PersistedStoreState>(buildStoreInitializer(), {
    name: PERSISTED_STORE_KEY,
    version: STORE_MIGRATION_VERSION,
    migrate,
    storage: createJSONStorage(() => ({
      getItem: (name) => localStorage.getItem(name),
      setItem: (name, value) => {
        if (!adoptingAnotherTab) localStorage.setItem(name, value);
      },
      removeItem: (name) => localStorage.removeItem(name),
    })),
    merge: (persistedState, currentState) =>
      mergePersistedState(currentState, (persistedState ?? {}) as PersistedStoreState),
    // Persist only durable preferences; session-scoped flags (next*) are intentionally omitted.
    partialize: buildPersistedState,
  }),
);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== PERSISTED_STORE_KEY || !event.newValue) return;
    const snapshot = readPersistedSnapshot(event.newValue, STORE_MIGRATION_VERSION, migrate);
    if (!snapshot) return;
    adoptingAnotherTab = true;
    try {
      useChatStore.setState((current) => adoptPersistedState(current, snapshot));
    } finally {
      adoptingAnotherTab = false;
    }
  });

  // Chats, folders, messages and tutor logs travel separately: another tab
  // announces what it wrote to IndexedDB, and this one reads it back.
  const tabSync = connectTabSync(useChatStore, tabChannel);
  window.addEventListener('pagehide', tabSync.pageHidden);
}
