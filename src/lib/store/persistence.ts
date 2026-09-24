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
import { endpointPersistFragment } from '@/lib/store/endpointSlice';
import { modelPersistFragment } from '@/lib/store/modelSlice';
import { uiPersistFragment } from '@/lib/store/uiSlice';
import { ENABLED_MODULES } from '@/lib/modules';

function persistFragments(): PersistFragment[] {
  const fragments = [
    chatPersistFragment,
    endpointPersistFragment,
    modelPersistFragment,
    uiPersistFragment,
  ];
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

/**
 * Another tab wrote its preferences: take them, but keep what this window is
 * showing. Without this each tab writes its own stale copy over the others', and
 * a server added in one tab vanishes the next time another tab saves anything.
 */
export function adoptPersistedState<T extends StoreState>(
  current: T,
  persisted: PersistedStoreState,
): T {
  const merged = mergePersistedState(current, persisted);
  return {
    ...merged,
    selectedChatId: current.selectedChatId,
    ui: {
      ...merged.ui,
      showSettings: current.ui.showSettings,
      sidebarCollapsed: current.ui.sidebarCollapsed,
      plan: current.ui.plan,
    },
  };
}

/** The persisted blob another tab wrote, or undefined when this build cannot read it. */
export function readPersistedSnapshot(
  raw: string,
  version: number,
  migrate: (state: unknown, fromVersion: number) => unknown,
): PersistedStoreState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const { state, version: written } = parsed as { state?: unknown; version?: unknown };
  if (!state || typeof state !== 'object' || typeof written !== 'number') return undefined;
  // A newer build in another tab: its shape is not ours to guess at.
  if (written > version) return undefined;
  return (written < version ? migrate(state, written) : state) as PersistedStoreState;
}
