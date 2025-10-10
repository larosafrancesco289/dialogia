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
        ...createCompareSlice(sliceSet, sliceGet, sliceStore),
        ...createChatSlice(sliceSet, sliceGet, sliceStore),
        ...createMessageSlice(sliceSet, sliceGet, sliceStore),
        ...createUiSlice(sliceSet, sliceGet, sliceStore),
        ...createTutorSlice(sliceSet, sliceGet, sliceStore),
      };
    },
    {
      name: 'dialogia-ui',
      version: 2,
      migrate: (persistedState: unknown, version?: number): Partial<StoreState> => {
        if (!persistedState || typeof persistedState !== 'object') return {};
        const state = persistedState as Partial<StoreState> & Record<string, any>;
        if ((version ?? 0) >= 2) return state;

        const migrateSettings = (input: any) => {
          if (!input || typeof input !== 'object') return input;
          const next = { ...input };
          if ('search_with_brave' in next) {
            if (next.search_enabled == null) next.search_enabled = !!next.search_with_brave;
            delete next.search_with_brave;
          }
          return next;
        };

        const next: Partial<StoreState> & Record<string, any> = { ...state };

        if (Array.isArray(state.chats)) {
          next.chats = state.chats.map((chat) => {
            if (!chat || typeof chat !== 'object') return chat;
            const updatedSettings = migrateSettings((chat as any).settings);
            return { ...chat, settings: updatedSettings };
          });
        }

        if (state.messages && typeof state.messages === 'object') {
          const migratedMessages: Record<string, any[]> = {};
          for (const [chatId, list] of Object.entries(state.messages as any)) {
            if (!Array.isArray(list)) {
              migratedMessages[chatId] = list as any;
              continue;
            }
            migratedMessages[chatId] = list.map((message: any) => {
              if (!message || typeof message !== 'object') return message;
              const nextMessage = { ...message };
              if (nextMessage.genSettings && typeof nextMessage.genSettings === 'object') {
                nextMessage.genSettings = migrateSettings(nextMessage.genSettings);
              }
              if (nextMessage.settings && typeof nextMessage.settings === 'object') {
                nextMessage.settings = migrateSettings(nextMessage.settings);
              }
              return nextMessage;
            });
          }
          next.messages = migratedMessages as any;
        }

        if (state.ui && typeof state.ui === 'object') {
          const ui = { ...(state.ui as Record<string, any>) };
          if ('nextSearchWithBrave' in ui) {
            if (ui.nextSearchEnabled == null) ui.nextSearchEnabled = !!ui.nextSearchWithBrave;
            delete ui.nextSearchWithBrave;
          }
          next.ui = ui as any;
        }

        return next;
      },
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
          experimentalDeepResearch: s.ui.experimentalDeepResearch,
          experimentalTutor: s.ui.experimentalTutor,
          tutorDefaultModelId: s.ui.tutorDefaultModelId,
          tutorMemoryModelId: s.ui.tutorMemoryModelId,
          tutorMemoryFrequency: s.ui.tutorMemoryFrequency,
          tutorMemoryAutoUpdate: s.ui.tutorMemoryAutoUpdate,
          tutorGlobalMemory: s.ui.tutorGlobalMemory,
          forceTutorMode: s.ui.forceTutorMode,
        },
      }) as Partial<StoreState>,
    },
  ),
);
