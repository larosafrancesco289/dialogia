'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StoreState } from '@/lib/store/types';
import { createModelSlice } from '@/lib/store/modelSlice';
import { createCompareSlice } from '@/lib/store/compareSlice';
import { createChatSlice } from '@/lib/store/chatSlice';
import { createMessageSlice } from '@/lib/store/messageSlice';
import { createUiSlice } from '@/lib/store/uiSlice';
import { createTutorSlice } from '@/lib/store/tutorSlice';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';

export const useChatStore = create<StoreState>()(
  persist(
    ((set: StoreSetter, get: StoreGetter, store: unknown) => {
      const sliceSet = set as StoreSetter;
      const sliceGet = get as StoreGetter;
      const sliceStore = store as any;

      return {
        // Base state containers
        chats: [],
        folders: [],
        messages: {},
        selectedChatId: undefined,

        // Feature slices (state + actions)
        ...createModelSlice(sliceSet, sliceGet, sliceStore),
        ...createCompareSlice(sliceSet, sliceGet, sliceStore),
        ...createChatSlice(sliceSet, sliceGet, sliceStore),
        ...createMessageSlice(sliceSet, sliceGet, sliceStore),
        ...createUiSlice(sliceSet, sliceGet, sliceStore),
        ...createTutorSlice(sliceSet, sliceGet, sliceStore),
      };
    }) as any,
    {
      name: 'dialogia-ui',
      version: 1,
      migrate: ((persistedState: unknown) => (persistedState as Partial<StoreState>) ?? {}) as any,
      // Persist only durable preferences; session-scoped flags (next*) are intentionally omitted.
      partialize: ((s: StoreState) => ({
        selectedChatId: s.selectedChatId,
        favoriteModelIds: s.favoriteModelIds,
        hiddenModelIds: s.hiddenModelIds,
        ui: {
          showSettings: s.ui.showSettings,
          sidebarCollapsed: s.ui.sidebarCollapsed,
          debugMode: s.ui.debugMode,
          tutorContextMode: s.ui.tutorContextMode,
          zdrOnly: s.ui.zdrOnly,
          routePreference: s.ui.routePreference,
          experimentalBrave: s.ui.experimentalBrave,
          experimentalDeepResearch: s.ui.experimentalDeepResearch,
          experimentalTutor: s.ui.experimentalTutor,
          tutorDefaultModelId: s.ui.tutorDefaultModelId,
          tutorMemoryModelId: s.ui.tutorMemoryModelId,
          tutorMemoryFrequency: s.ui.tutorMemoryFrequency,
          tutorMemoryAutoUpdate: s.ui.tutorMemoryAutoUpdate,
          tutorGlobalMemory: s.ui.tutorGlobalMemory,
          forceTutorMode: s.ui.forceTutorMode,
        },
      })) as any,
    } as any,
  ) as any,
);
