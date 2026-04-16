import type { ChatDefaults } from '@/lib/types';

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
