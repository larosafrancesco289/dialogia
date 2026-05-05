'use client';
import { createWithEqualityFn } from 'zustand/traditional';
import { persist } from 'zustand/middleware';
import type { PersistedStoreState, StoreGetter, StoreSetter, StoreState } from '@/lib/store/types';
import { createModelSlice } from '@/lib/store/modelSlice';
import { createChatSlice } from '@/lib/store/chatSlice';
import { createMessageSlice } from '@/lib/store/messageSlice';
import { createUiSlice } from '@/lib/store/uiSlice';
import { createTutorSlice } from '@/lib/store/tutorSlice';
import { migrate } from '@/lib/store/migrations';
import { STORE_MIGRATION_VERSION } from '@/lib/store/versions';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';

export const PERSISTED_STORE_KEY = 'dialogia-ui';

export const useChatStore = createWithEqualityFn<StoreState>()(
  persist<StoreState, [], [], PersistedStoreState>(
    (set, get, store) => {
      const sliceSet: StoreSetter = set;
      const sliceGet: StoreGetter = get;
      const sliceStore = store;

      return {
        // Base state containers
        chats: [],
        folders: [],
        messagesById: {},
        messageIdsByChatId: {},
        selectedChatId: undefined,

        // Feature slices (state + actions)
        ...createModelSlice(sliceSet, sliceGet, sliceStore),
        ...createChatSlice(sliceSet, sliceGet, sliceStore),
        ...createMessageSlice(sliceSet, sliceGet, sliceStore),
        ...createUiSlice(sliceSet, sliceGet, sliceStore),
        ...createTutorSlice(sliceSet, sliceGet, sliceStore),
      };
    },
    {
      name: PERSISTED_STORE_KEY,
      version: STORE_MIGRATION_VERSION,
      migrate,
      merge: (persistedState, currentState) =>
        mergePersistedState(currentState, (persistedState ?? {}) as PersistedStoreState),
      // Persist only durable preferences; session-scoped flags (next*) are intentionally omitted.
      partialize: buildPersistedState,
    },
  ),
);
