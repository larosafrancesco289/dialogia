import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import type { StoreState } from '@/lib/store/types';
import { createModelIndex } from '@/lib/models';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { buildDefaultVoiceState } from '@/lib/voice/types';

export function createTestStoreState(overrides: Partial<StoreState> = {}) {
  const base = {
    chats: [],
    folders: [],
    messages: {},
    selectedChatId: undefined,
    models: [],
    modelIndex: createModelIndex([]),
    favoriteModelIds: [],
    hiddenModelIds: [],
    ui: buildDefaultUIState(),
    voice: buildDefaultVoiceState(),
  } as unknown as StoreState;

  const state = {
    ...base,
    ...overrides,
    ui: {
      ...base.ui,
      ...(overrides.ui || {}),
    },
    voice: {
      ...base.voice,
      ...(overrides.voice || {}),
    },
  } as unknown as StoreState;

  const set: StoreSetter = (updater) => {
    const patch = typeof updater === 'function' ? (updater as any)(state) : updater;
    if (!patch) return;
    Object.assign(state, patch);
  };

  const get: StoreGetter = () => state;

  return { state, set, get };
}
