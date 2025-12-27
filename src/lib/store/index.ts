'use client';
import { createWithEqualityFn } from 'zustand/traditional';
import { persist } from 'zustand/middleware';
import type { StoreDataState, StoreGetter, StoreSetter, StoreState } from '@/lib/store/types';
import { createModelSlice } from '@/lib/store/modelSlice';
import { createChatSlice } from '@/lib/store/chatSlice';
import { createMessageSlice } from '@/lib/store/messageSlice';
import { createUiSlice } from '@/lib/store/uiSlice';
import { createTutorSlice } from '@/lib/store/tutorSlice';
import { createVoiceSlice } from '@/lib/store/voiceSlice';
import { migrate } from '@/lib/store/migrations';
import { STORE_MIGRATION_VERSION } from '@/lib/db/versions';

const mergeUiState = (
  current: StoreDataState['ui'],
  persisted?: Partial<StoreDataState['ui']>,
): StoreDataState['ui'] => {
  if (!persisted) return current;
  return {
    ...current,
    ...persisted,
    flags: { ...current.flags, ...(persisted.flags ?? {}) },
    debug: { ...current.debug, ...(persisted.debug ?? {}) },
    search: { ...current.search, ...(persisted.search ?? {}) },
    tutor: { ...current.tutor, ...(persisted.tutor ?? {}) },
    plan: { ...current.plan, ...(persisted.plan ?? {}) },
  };
};

export const useChatStore = createWithEqualityFn<StoreState>()(
  persist<StoreState, [], [], Partial<StoreState>>(
    (set, get, store) => {
      const sliceSet: StoreSetter = set;
      const sliceGet: StoreGetter = get;
      const sliceStore = store;

      return {
        // Base state containers
        chats: [],
        folders: [],
        messages: {},
        selectedChatId: undefined,

        // Feature slices (state + actions)
        ...createModelSlice(sliceSet, sliceGet, sliceStore),
        ...createChatSlice(sliceSet, sliceGet, sliceStore),
        ...createMessageSlice(sliceSet, sliceGet, sliceStore),
        ...createUiSlice(sliceSet, sliceGet, sliceStore),
        ...createTutorSlice(sliceSet, sliceGet, sliceStore),
        ...createVoiceSlice(sliceSet, sliceGet, sliceStore),
      };
    },
    {
      name: 'dialogia-ui',
      version: STORE_MIGRATION_VERSION,
      migrate,
      merge: (persistedState, currentState) => {
        const persisted = (persistedState || {}) as Partial<StoreState>;
        return {
          ...currentState,
          ...persisted,
          ui: mergeUiState(currentState.ui, persisted.ui),
        };
      },
      // Persist only durable preferences; session-scoped flags (next*) are intentionally omitted.
      partialize: (s: StoreState) =>
        ({
          selectedChatId: s.selectedChatId,
          favoriteModelIds: s.favoriteModelIds,
          hiddenModelIds: s.hiddenModelIds,
          ui: {
            showSettings: s.ui.showSettings,
            sidebarCollapsed: s.ui.sidebarCollapsed,
            zdrOnly: s.ui.zdrOnly,
            routePreference: s.ui.routePreference,
            flags: {
              experimentalBrave: s.ui.flags.experimentalBrave,
              experimentalTutor: s.ui.flags.experimentalTutor,
              enableMultiModelChat: s.ui.flags.enableMultiModelChat,
            },
            debug: { mode: s.ui.debug.mode },
            tutor: {
              contextMode: s.ui.tutor.contextMode,
              thesisMode: s.ui.tutor.thesisMode,
              researchMode: s.ui.tutor.researchMode,
              defaultModelId: s.ui.tutor.defaultModelId,
              forceMode: s.ui.tutor.forceMode,
            },
          },
        }) as Partial<StoreState>,
    },
  ),
);
