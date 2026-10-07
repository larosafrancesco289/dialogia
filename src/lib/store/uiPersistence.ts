// Module: store/uiPersistence
// Responsibility: The persisted projection of UI state, owned by the UI slice.
// Persisted key names are load-bearing: renaming one breaks users' localStorage.

import type { PersistedUiState, UIState } from '@/lib/store/uiTypes';
import { mergeChatDefaults, upgradeChatDefaults } from '@/lib/settings/chatDefaults';
import { isLanguagePreference } from '@/lib/i18n/locales';

export function buildPersistedUiState(ui: UIState): PersistedUiState {
  return {
    showSettings: ui.showSettings,
    // A fold the narrow window made is not the reader's: saved as the open
    // sidebar they had, so a wide reload brings it back.
    sidebarCollapsed: ui.sidebarFoldedByLayout ? false : ui.sidebarCollapsed,
    zdrOnly: ui.zdrOnly,
    messageTimestamps: ui.messageTimestamps,
    language: ui.language,
    memoryEnabled: ui.memoryEnabled,
    memorySensitive: ui.memorySensitive,
    dynamicDefaultResolutions: ui.dynamicDefaultResolutions,
    chatDefaults: ui.chatDefaults,
    flags: { experimentalTutor: ui.flags.experimentalTutor },
    debug: { mode: ui.debug.mode },
    tutor: {
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
    // Still written (the key is part of the persisted shape), never restored:
    // a load, or another tab's last write, must not open Settings by itself.
    showSettings: current.showSettings,
    // A language this build does not speak (a newer build's backup) is Auto.
    language: isLanguagePreference(persisted.language) ? persisted.language : current.language,
    chatDefaults: mergeChatDefaults(
      current.chatDefaults,
      upgradeChatDefaults(persisted.chatDefaults),
    ),
    flags: { ...current.flags, ...(persisted.flags ?? {}) },
    debug: { ...current.debug, ...(persisted.debug ?? {}) },
    tutor: { ...current.tutor, ...(persisted.tutor ?? {}) },
    plan: { ...current.plan, ...(persisted.plan ?? {}) },
  };
}
