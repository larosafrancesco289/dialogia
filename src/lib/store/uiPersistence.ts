// Module: store/uiPersistence
// Responsibility: The persisted projection of UI state, owned by the UI slice.
// Persisted key names are load-bearing: renaming one breaks users' localStorage.

import type { PersistedUiState, UIState } from '@/lib/store/uiTypes';
import { mergeChatDefaults } from '@/lib/settings/chatDefaults';

export function buildPersistedUiState(ui: UIState): PersistedUiState {
  return {
    showSettings: ui.showSettings,
    sidebarCollapsed: ui.sidebarCollapsed,
    introSeen: ui.introSeen,
    zdrOnly: ui.zdrOnly,
    messageTimestamps: ui.messageTimestamps,
    dynamicDefaultResolutions: ui.dynamicDefaultResolutions,
    chatDefaults: ui.chatDefaults,
    flags: { experimentalTutor: ui.flags.experimentalTutor },
    debug: { mode: ui.debug.mode },
    tutor: {
      contextMode: ui.tutor?.contextMode,
      defaultModelId: ui.tutor?.defaultModelId,
      forceMode: ui.tutor?.forceMode,
      autoScroll: ui.tutor?.autoScroll,
    },
    plan: { rightPanelOpen: ui.plan?.rightPanelOpen },
  };
}

export function mergePersistedUiState(
  current: UIState,
  persisted?: Partial<PersistedUiState>,
): UIState {
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
}
