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
import { chatPresence } from '@/lib/sync/chatPresence';

export const PERSISTED_STORE_KEY = 'dialogia-ui';

// Every tab saves its open chat into the one shared blob, so a reload would
// open whichever tab saved last; each tab also keeps its own, for itself.
const TAB_CHAT_KEY = 'dialogia-tab-chat';

function readTabChat(): string | undefined {
  try {
    return sessionStorage.getItem(TAB_CHAT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function keepTabChat(chatId: string | undefined): void {
  try {
    if (chatId) sessionStorage.setItem(TAB_CHAT_KEY, chatId);
    else sessionStorage.removeItem(TAB_CHAT_KEY);
  } catch {
    // Storage blocked: a reload falls back to the shared blob's chat.
  }
}

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
    merge: (persistedState, currentState) => {
      const merged = mergePersistedState(
        currentState,
        (persistedState ?? {}) as PersistedStoreState,
      );
      const tabChat = typeof window !== 'undefined' ? readTabChat() : undefined;
      return tabChat ? { ...merged, selectedChatId: tabChat } : merged;
    },
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

  // The chat open here is one the other tabs must not tidy away.
  chatPresence.hold(useChatStore.getState().selectedChatId);
  useChatStore.subscribe((state) => {
    chatPresence.hold(state.selectedChatId);
    keepTabChat(state.selectedChatId);
  });
}
