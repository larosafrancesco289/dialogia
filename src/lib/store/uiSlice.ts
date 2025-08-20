import type { StoreState, UIState } from '@/lib/store/types';

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
    braveByMessageId: {},
    compare: { isOpen: false, prompt: '', selectedModelIds: [], runs: {} },
  };

  return {
    ui: initial,
    setUI(partial: Partial<UIState>) {
      set((s) => ({ ui: { ...s.ui, ...partial } }));
    },
  } satisfies Partial<StoreState>;
}

