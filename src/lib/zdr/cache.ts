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

const ZDR_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

type ZdrSnapshot = {
  modelIds?: Iterable<string> | null;
  providerIds?: Iterable<string> | null;
  fetchedAt?: number;
};

function hasValues(values?: Iterable<string> | null): boolean {
  if (!values) return false;
  for (const _ of values) return true;
  return false;
}

function isCacheFresh(snapshot: ZdrSnapshot, now: number): boolean {
  if (!snapshot.fetchedAt) return false;
  if (!hasValues(snapshot.modelIds) && !hasValues(snapshot.providerIds)) return false;
  return now - snapshot.fetchedAt < ZDR_CACHE_TTL_MS;
}

export function getZdrCacheSnapshot(get: StoreGetter): ZdrSnapshot {
  const state = get();
  return {
    modelIds: state.zdrModelIds,
    providerIds: state.zdrProviderIds,
    fetchedAt: state.zdrFetchedAt,
  };
}

export function hydrateZdrCache(set: StoreSetter, lists: ZdrLists, fetchedAt?: number) {
  set(() => toZdrState(lists, fetchedAt ?? Date.now()));
}

export async function refreshZdrListsIfNeeded(set: StoreSetter, get: StoreGetter): Promise<ZdrLists> {
  const snapshot = getZdrCacheSnapshot(get);
  const now = Date.now();
  if (isCacheFresh(snapshot, now)) {
    return {
      modelIds: new Set(snapshot.modelIds ?? []),
      providerIds: new Set(snapshot.providerIds ?? []),
    };
  }
  const lists = await ensureZdrLists();
  hydrateZdrCache(set, lists, now);
  return lists;
}

export async function ensureListsAndFilterCached<T extends { id?: string }>(
  models: T[],
  mode: ZdrFilterMode,
  set: StoreSetter,
  get: StoreGetter,
): Promise<EnsureListsResult<T>> {
  const snapshot = getZdrCacheSnapshot(get);
  const now = Date.now();
  const fresh = isCacheFresh(snapshot, now);
  const existing = fresh
    ? {
        modelIds: snapshot.modelIds,
        providerIds: snapshot.providerIds,
      }
    : undefined;
  const result = await ensureListsAndFilter(models, mode, existing);
  const fetchedAt = fresh ? snapshot.fetchedAt ?? now : now;
  hydrateZdrCache(set, result.lists, fetchedAt);
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
