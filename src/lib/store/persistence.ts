// Module: store/persistence
// Responsibility: Compose each slice's PersistFragment into the persisted blob and
// back. Nothing here enumerates nested shapes; the owning slice does.

import type {
  PersistFragment,
  PersistedStoreState,
  StoreDataState,
  StoreState,
} from '@/lib/store/types';
import { chatPersistFragment } from '@/lib/store/chatSlice';
import { modelPersistFragment } from '@/lib/store/modelSlice';
import { uiPersistFragment } from '@/lib/store/uiSlice';
import { ENABLED_MODULES } from '@/lib/modules';

function persistFragments(): PersistFragment[] {
  const fragments = [chatPersistFragment, modelPersistFragment, uiPersistFragment];
  for (const appModule of ENABLED_MODULES) {
    if (appModule.persistFragment) fragments.push(appModule.persistFragment);
  }
  return fragments;
}

export function buildPersistedState(state: StoreState): PersistedStoreState {
  let persisted: Record<string, unknown> = {};
  for (const fragment of persistFragments()) {
    persisted = { ...persisted, ...fragment.partialize(state) };
  }
  return persisted as PersistedStoreState;
}

export function mergePersistedState<T extends StoreDataState>(
  currentState: T,
  persisted?: PersistedStoreState,
): T {
  if (!persisted) return currentState;
  const raw = persisted as unknown as Record<string, unknown>;
  // Scalars land by key. A fragment with a merge() owns a nested shape, and must
  // see the untouched current state — the blind spread above has already replaced
  // its key with the partial persisted value.
  let next = { ...currentState, ...persisted } as T;
  for (const fragment of persistFragments()) {
    if (!fragment.merge) continue;
    next = { ...next, ...fragment.merge(currentState as unknown as StoreState, raw) };
  }
  return next;
}
