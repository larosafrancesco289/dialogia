import type { StoreState, UIState } from '@/lib/store/types';
import { getDefaultZdrOnly, getRoutePreferenceDefault } from '@/lib/config';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { createStoreSlice } from '@/lib/store/createSlice';

export const createUiSlice = createStoreSlice((set, get) => {
  const initial: UIState = {
    showSettings: false,
    isStreaming: false,
    sidebarCollapsed: false,
    debugMode: false,
    debugByMessageId: {},
    autoReasoningModelIds: {},
    tutorDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    learnerModelDebugByMessageId: {},
    forceTutorMode: false,
    nextModel: undefined,
    nextSearchEnabled: false,
    nextDeepResearch: false,
    nextTutorMode: false,
    nextTutorNudge: undefined,
    nextReasoningEffort: undefined,
    nextReasoningTokens: undefined,
    nextSystem: undefined,
    nextTemperature: undefined,
    nextTopP: undefined,
    nextMaxTokens: undefined,
    nextShowThinking: undefined,
    nextShowStats: undefined,
    nextParallelModels: undefined,
    tutorContextMode: 'full',
    zdrOnly: getDefaultZdrOnly(),
    routePreference: getRoutePreferenceDefault(),
    // Experimental feature toggles (Tutor defaults on; others opt-in via Settings)
    experimentalBrave: false,
    experimentalDeepResearch: false,
    experimentalTutor: true,
    enableMultiModelChat: false,
    braveByMessageId: {},
    tutorByMessageId: {},
    tutorProfileByChatId: {},
    tutorGreetedByChatId: {},
    planSheetOpen: false,
    planGenerationByChatId: {},
  };

  return {
    ui: initial,
    setUI(partial: Partial<UIState>) {
      set((s) => {
        const nextUi: UIState = { ...s.ui, ...partial };
        if (partial.experimentalTutor === false) {
          nextUi.forceTutorMode = false;
          nextUi.nextTutorMode = false;
        }
        if (partial.enableMultiModelChat === false) {
          nextUi.nextParallelModels = undefined;
        }
        return { ui: nextUi };
      });
      if (partial.enableMultiModelChat === false) {
        const { selectedChatId, chats, updateChatSettings } = get();
        if (!selectedChatId || typeof updateChatSettings !== 'function') return;
        const activeChat = chats.find((chat) => chat.id === selectedChatId);
        if (
          !activeChat ||
          !Array.isArray(activeChat.settings.parallel_models) ||
          activeChat.settings.parallel_models.length === 0
        ) {
          return;
        }
        void updateChatSettings({ parallel_models: [] });
      }
    },
  } satisfies Partial<StoreState>;
});
