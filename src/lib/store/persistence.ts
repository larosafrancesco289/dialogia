// Module: store/persistence
// Responsibility: Define persisted store slices and merge behavior for Zustand hydration.

import type {
  PersistedStoreState,
  PersistedUiState,
  StoreDataState,
  StoreState,
  UIState,
} from '@/lib/store/types';
import { mergeChatDefaults } from '@/lib/settings/chatDefaults';

const mergePersistedUiState = (
  current: UIState,
  persisted?: Partial<PersistedUiState>,
): UIState => {
  if (!persisted) return current;
  return {
    ...current,
    ...persisted,
    chatDefaults: mergeChatDefaults(current.chatDefaults, persisted.chatDefaults),
    flags: { ...current.flags, ...(persisted.flags ?? {}) },
    debug: { ...current.debug, ...(persisted.debug ?? {}) },
    tutor: { ...current.tutor, ...(persisted.tutor ?? {}) },
    plan: { ...current.plan, ...(persisted.plan ?? {}) },
  };
};

export function mergePersistedState<T extends StoreDataState>(
  currentState: T,
  persisted?: PersistedStoreState,
): T {
  if (!persisted) return currentState;
  return {
    ...currentState,
    ...persisted,
    ui: mergePersistedUiState(currentState.ui, persisted.ui),
  };
}

export function buildPersistedState(state: StoreState): PersistedStoreState {
  return {
    selectedChatId: state.selectedChatId,
    favoriteModelIds: state.favoriteModelIds,
    hiddenModelIds: state.hiddenModelIds,
    ui: {
      showSettings: state.ui.showSettings,
      sidebarCollapsed: state.ui.sidebarCollapsed,
      zdrOnly: state.ui.zdrOnly,
      routePreference: state.ui.routePreference,
      chatDefaults: state.ui.chatDefaults,
      flags: {
        experimentalTutor: state.ui.flags.experimentalTutor,
        enableMultiModelChat: state.ui.flags.enableMultiModelChat,
      },
      debug: { mode: state.ui.debug.mode },
      tutor: {
        contextMode: state.ui.tutor.contextMode,
        researchMode: state.ui.tutor.researchMode,
        defaultModelId: state.ui.tutor.defaultModelId,
        forceMode: state.ui.tutor.forceMode,
        studyCondition: state.ui.tutor.studyCondition,
        autoScroll: state.ui.tutor.autoScroll,
      },
      plan: {
        rightPanelOpen: state.ui.plan.rightPanelOpen,
      },
    },
  };
}
