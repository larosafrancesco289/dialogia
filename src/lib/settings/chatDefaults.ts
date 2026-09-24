import type { ChatDefaults, ChatUiSettings } from '@/lib/types';
import { upgradeLegacyBaseSystem } from '@/lib/settings/baseSystem';

/** Saved defaults still wearing an old built-in prompt move to the current one. */
export function upgradeChatDefaults(defaults?: ChatDefaults): ChatDefaults | undefined {
  if (defaults?.system === undefined) return defaults;
  const system = upgradeLegacyBaseSystem(defaults.system);
  return system === defaults.system ? defaults : { ...defaults, system };
}

export function mergeChatDefaults(
  base?: ChatDefaults,
  patch?: ChatDefaults,
): ChatDefaults | undefined {
  if (!patch) return base;
  if (!base) return patch;
  return {
    ...base,
    ...patch,
    generation: { ...(base.generation ?? {}), ...(patch.generation ?? {}) },
    ui: { ...(base.ui ?? {}), ...(patch.ui ?? {}) },
    features: {
      ...(base.features ?? {}),
      search: { ...(base.features?.search ?? {}), ...(patch.features?.search ?? {}) },
    },
  };
}

export const DEFAULT_DISPLAY_PREFERENCES: ChatUiSettings = {
  showThinkingByDefault: false,
  showStats: false,
  showToolCallLog: false,
  showDebugRawJson: true,
};

/**
 * How replies are displayed is one app-wide preference, read from the saved
 * defaults. A chat's own `settings.ui` is a copy taken when it was created and
 * is kept only so old records stay readable; nothing displays from it.
 */
export function resolveDisplayPreferences(defaults?: ChatDefaults): ChatUiSettings {
  const ui = defaults?.ui;
  return {
    showThinkingByDefault:
      ui?.showThinkingByDefault ?? DEFAULT_DISPLAY_PREFERENCES.showThinkingByDefault,
    showStats: ui?.showStats ?? DEFAULT_DISPLAY_PREFERENCES.showStats,
    showToolCallLog: ui?.showToolCallLog ?? DEFAULT_DISPLAY_PREFERENCES.showToolCallLog,
    showDebugRawJson: ui?.showDebugRawJson ?? DEFAULT_DISPLAY_PREFERENCES.showDebugRawJson,
  };
}
