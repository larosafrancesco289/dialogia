'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StoreState } from '@/lib/store/types';
import { createModelSlice } from '@/lib/store/modelSlice';
import { createChatSlice } from '@/lib/store/chatSlice';
import { createMessageSlice } from '@/lib/store/messageSlice';
import { createUiSlice } from '@/lib/store/uiSlice';
import { createTutorSlice } from '@/lib/store/tutorSlice';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { migrate } from '@/lib/store/migrations';

export const useChatStore = create<StoreState>()(
  persist(
    (set, get, store) => {
      const sliceSet: StoreSetter = set;
      const sliceGet: StoreGetter = get;
      const sliceStore = store as any;

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
      };
    },
    {
      name: 'dialogia-ui',
      version: 2,
      migrate,
      // Persist only durable preferences; session-scoped flags (next*) are intentionally omitted.
      partialize: (s: StoreState) => ({
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
          experimentalTutor: s.ui.experimentalTutor,
          enableMultiModelChat: s.ui.enableMultiModelChat,
          tutorDefaultModelId: s.ui.tutorDefaultModelId,
          forceTutorMode: s.ui.forceTutorMode,
          tutorThesisMode: s.ui.tutorThesisMode,
          tutorResearchMode: s.ui.tutorResearchMode,
        },
      }) as Partial<StoreState>,
    },
  ),
);
