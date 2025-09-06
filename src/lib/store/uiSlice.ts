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
    nextModel: undefined,
    nextSearchWithBrave: false,
    nextTutorMode: false,
    nextReasoningEffort: undefined,
    nextReasoningTokens: undefined,
    nextSystem: undefined,
    nextTemperature: undefined,
    nextTopP: undefined,
    nextMaxTokens: undefined,
    nextShowThinking: undefined,
    nextShowStats: undefined,
    zdrOnly: defaultZdrOnly(),
    routePreference: 'speed',
    braveByMessageId: {},
    tutorByMessageId: {},
    tutorProfileByChatId: {},
    compare: { isOpen: false, prompt: '', selectedModelIds: [], runs: {} },
  };

  return {
    ui: initial,
    setUI(partial: Partial<UIState>) {
      set((s) => ({ ui: { ...s.ui, ...partial } }));
    },
  } satisfies Partial<StoreState>;
}
