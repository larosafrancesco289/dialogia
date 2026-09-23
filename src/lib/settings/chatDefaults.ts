import type { ChatDefaults } from '@/lib/types';
import { upgradeLegacyBaseSystem } from '@/lib/agent/prompts/baseSystem';

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
