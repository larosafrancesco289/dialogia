import type { StoreState, UIState } from '@/lib/store/types';
import { defaultZdrOnly } from '@/lib/env';

export function createUiSlice(
  set: (updater: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  const initial: UIState = {
    showSettings: false,
    isStreaming: false,
    sidebarCollapsed: false,
    debugMode: false,
    debugByMessageId: {},
    autoReasoningModelIds: {},
    nextModel: undefined,
    nextSearchWithBrave: false,
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
    tutorContextMode: 'full',
    zdrOnly: defaultZdrOnly(),
    routePreference: 'speed',
    // Experimental features default off unless explicitly enabled in Settings
    experimentalBrave: false,
    experimentalDeepResearch: false,
    experimentalTutor: false,
    braveByMessageId: {},
    tutorByMessageId: {},
    tutorProfileByChatId: {},
    tutorGreetedByChatId: {},
    compare: { isOpen: false, prompt: '', selectedModelIds: [], runs: {} },
  };

  return {
    ui: initial,
    setUI(partial: Partial<UIState>) {
      set((s) => ({ ui: { ...s.ui, ...partial } }));
    },
  } satisfies Partial<StoreState>;
}
