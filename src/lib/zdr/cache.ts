// Module: zdr/cache
// Responsibility: Manage cached ZDR model/provider lists in the store and
// expose helpers that reuse ensureListsAndFilter without duplicating logic in slices.

import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { ensureZdrLists, toZdrState, type ZdrLists } from '@/lib/zdr';
import {
  ensureListsAndFilter,
  guardModelOrNotice,
  type EnsureListsResult,
  type ZdrFilterMode,
} from '@/lib/zdr/enforce';

export function getZdrCacheSnapshot(get: StoreGetter): {
  modelIds?: Iterable<string> | null;
  providerIds?: Iterable<string> | null;
} {
  const state = get();
  return {
    modelIds: state.zdrModelIds,
    providerIds: state.zdrProviderIds,
  };
}

export function hydrateZdrCache(set: StoreSetter, lists: ZdrLists) {
  set(() => toZdrState(lists));
}

export async function refreshZdrListsIfNeeded(set: StoreSetter, get: StoreGetter): Promise<ZdrLists> {
  const lists = await ensureZdrLists(getZdrCacheSnapshot(get));
  hydrateZdrCache(set, lists);
  return lists;
}

export async function ensureListsAndFilterCached<T extends { id?: string }>(
  models: T[],
  mode: ZdrFilterMode,
  set: StoreSetter,
  get: StoreGetter,
): Promise<EnsureListsResult<T>> {
  const result = await ensureListsAndFilter(models, mode, getZdrCacheSnapshot(get));
  hydrateZdrCache(set, result.lists);
  return result;
}

export async function guardZdrOrNotify(
  modelId: string,
  set: StoreSetter,
  get: StoreGetter,
): Promise<boolean> {
  const result = await ensureListsAndFilterCached(
    [{ id: modelId }],
    'enforce',
    set,
    get,
  );
  return guardModelOrNotice(modelId, set, result.lists);
}
