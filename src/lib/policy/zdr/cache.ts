// Module: zdr/cache
// Responsibility: Manage cached ZDR model/provider lists in the store and
// expose helpers that reuse computeZdrFilter without duplicating logic in slices.

import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { ensureZdrLists, toZdrState, type ZdrLists, type ZdrFetchers } from './index';
import { computeZdrFilter, guardModelOrNotice } from './enforce';
import { ZDR_CACHE_TTL_MS } from './constants';
import type { EnsureListsResult, ZdrFilterMode, ZdrSnapshot } from './types';

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

export async function refreshZdrListsIfNeeded(
  set: StoreSetter,
  get: StoreGetter,
  fetchers?: ZdrFetchers,
): Promise<ZdrLists> {
  const snapshot = getZdrCacheSnapshot(get);
  const now = Date.now();
  if (isCacheFresh(snapshot, now)) {
    return {
      modelIds: new Set(snapshot.modelIds ?? []),
      providerIds: new Set(snapshot.providerIds ?? []),
    };
  }
  const lists = await ensureZdrLists(undefined, fetchers);
  hydrateZdrCache(set, lists, now);
  return lists;
}

export async function computeZdrFilterCached<T extends { id?: string }>(
  models: T[],
  mode: ZdrFilterMode,
  set: StoreSetter,
  get: StoreGetter,
  fetchers?: ZdrFetchers,
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
  const result = await computeZdrFilter(models, mode, existing, fetchers);
  const fetchedAt = fresh ? snapshot.fetchedAt ?? now : now;
  hydrateZdrCache(set, result.lists, fetchedAt);
  return result;
}

export async function guardZdrOrNotifyCached(
  modelId: string,
  set: StoreSetter,
  get: StoreGetter,
  fetchers?: ZdrFetchers,
): Promise<boolean> {
  const result = await computeZdrFilterCached(
    [{ id: modelId }],
    'enforce',
    set,
    get,
    fetchers,
  );
  return guardModelOrNotice(modelId, set, result.lists);
}
