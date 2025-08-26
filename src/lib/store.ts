'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StoreState } from '@/lib/store/types';
import { createModelSlice } from '@/lib/store/modelSlice';
import { createCompareSlice } from '@/lib/store/compareSlice';
import { createChatSlice } from '@/lib/store/chatSlice';
import { createMessageSlice } from '@/lib/store/messageSlice';
import { createUiSlice } from '@/lib/store/uiSlice';

export const useChatStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Base state containers
      chats: [],
      folders: [],
      messages: {},
      selectedChatId: undefined,

      // Feature slices (state + actions)
      ...(createModelSlice as any)(set, get),
      ...(createCompareSlice as any)(set, get),
      ...(createChatSlice as any)(set, get),
      ...(createMessageSlice as any)(set, get),
      ...(createUiSlice as any)(set, get),

      // Ephemeral controllers (not persisted)
      _controller: undefined as AbortController | undefined,
      _compareControllers: {} as Record<string, AbortController>,
    }),
    {
      name: 'dialogia-ui',
      partialize: (s) => ({
        selectedChatId: s.selectedChatId,
        favoriteModelIds: s.favoriteModelIds,
        hiddenModelIds: s.hiddenModelIds,
        // Persist minimal UI preferences for better continuity
        ui: {
          sidebarCollapsed: s.ui.sidebarCollapsed,
          nextModel: s.ui.nextModel,
          nextSearchWithBrave: s.ui.nextSearchWithBrave,
          zdrOnly: s.ui.zdrOnly,
          routePreference: s.ui.routePreference,
        },
      }),
    },
  ),
);
