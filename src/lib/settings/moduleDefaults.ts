// Module: settings/moduleDefaults
// Responsibility: Let modules fill in their own chat-settings defaults, and say which
// model a chat should prefer when the module is driving it. Core knows the hook, not
// what any module puts in the settings block it owns.

import type { Chat, ChatSettings } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import { ENABLED_MODULES } from '@/lib/modules';

export type ModuleSettingsDefaults = {
  nextSettings: ChatSettings;
  changed: boolean;
  /** The model this module wants the turn to run on, if it has an opinion. */
  preferredModelId?: string;
};

export type ModuleSettingsPhase =
  // Reading or preparing a turn: fill in defaults, but do not switch anything on.
  | 'read'
  // The user is writing settings (new chat, settings update): a module may enable itself.
  | 'write';

export function applyModuleSettingsDefaults(args: {
  chat: Pick<Chat, 'settings'>;
  ui?: UiSnapshot;
  phase?: ModuleSettingsPhase;
}): ModuleSettingsDefaults {
  let settings = args.chat.settings;
  let changed = false;
  let preferredModelId: string | undefined;

  for (const appModule of ENABLED_MODULES) {
    const result = appModule.settingsDefaults?.({
      chat: { settings },
      ui: args.ui,
      phase: args.phase ?? 'read',
    });
    if (!result) continue;
    settings = result.nextSettings;
    changed = changed || result.changed;
    preferredModelId = result.preferredModelId ?? preferredModelId;
  }

  return { nextSettings: settings, changed, preferredModelId };
}
