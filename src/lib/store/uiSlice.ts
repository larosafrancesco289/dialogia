import type { StoreState, UIState } from '@/lib/store/types';
import { defaultZdrOnly } from '@/lib/env';
import {
  DEFAULT_TUTOR_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_FREQUENCY,
} from '@/lib/constants';
import { EMPTY_TUTOR_MEMORY } from '@/lib/agent/tutorMemory';

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
    tutorDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    tutorMemoryModelId: DEFAULT_TUTOR_MEMORY_MODEL_ID,
    tutorMemoryFrequency: DEFAULT_TUTOR_MEMORY_FREQUENCY,
    tutorMemoryAutoUpdate: true,
    tutorMemoryDebugByMessageId: {},
    tutorGlobalMemory: EMPTY_TUTOR_MEMORY,
    forceTutorMode: false,
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
    // Experimental feature toggles (Tutor defaults on; others opt-in via Settings)
    experimentalBrave: false,
    experimentalDeepResearch: false,
    experimentalTutor: true,
    braveByMessageId: {},
    tutorByMessageId: {},
    tutorProfileByChatId: {},
    tutorGreetedByChatId: {},
    compare: { isOpen: false, prompt: '', selectedModelIds: [], runs: {} },
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
        return { ui: nextUi };
      });
    },
  } satisfies Partial<StoreState>;
}
