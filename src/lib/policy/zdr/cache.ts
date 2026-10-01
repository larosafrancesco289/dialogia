// Module: zdr/cache
// Responsibility: Manage cached ZDR model/provider lists in the store and
// expose helpers that reuse computeZdrFilter without duplicating logic in slices.

import type {
  StoreSetter as ContractStoreSetter,
  StoreGetter as ContractStoreGetter,
} from '@/lib/contracts/store';
import {
  ensureZdrLists,
  evaluateZdrModel,
  filterZdrModels,
  toZdrState,
  type ZdrLists,
  type ZdrFetchers,
} from './index';
import { guardModelOrNotice } from './enforce';
import type { ModelDescriptor } from '@/lib/types';
import { findModelById } from '@/lib/models';
import { formatModelLabel } from '@/lib/models/labels';
import { ZDR_CACHE_TTL_MS } from './constants';
import type { EnsureListsResult, ZdrFilterMode, ZdrSnapshot } from './types';

// Minimal state type for ZDR cache operations
type ZdrCacheState = {
  models?: ModelDescriptor[];
  zdrModelIds?: string[];
  zdrProviderIds?: string[];
  zdrFetchedAt?: number;
  ui: { notice?: string };
  setNotice: (notice?: string) => void;
};

type StoreSetter<S extends ZdrCacheState = ZdrCacheState> = ContractStoreSetter<S>;
type StoreGetter<S extends ZdrCacheState = ZdrCacheState> = ContractStoreGetter<S>;

function hasValues(values?: Iterable<string> | null): boolean {
  if (!values) return false;
  for (const _ of values) return true;
  return false;
}

function toSet(values?: Iterable<string> | null): Set<string> {
  if (!values) return new Set<string>();
  return new Set<string>(Array.from(values).filter((v) => typeof v === 'string' && v.trim()));
}

function isCacheFresh(snapshot: ZdrSnapshot, now: number): boolean {
  if (!snapshot.fetchedAt) return false;
  if (!hasValues(snapshot.modelIds) && !hasValues(snapshot.providerIds)) return false;
  return now - snapshot.fetchedAt < ZDR_CACHE_TTL_MS;
}

export function getZdrCacheSnapshot<S extends ZdrCacheState>(get: StoreGetter<S>): ZdrSnapshot {
  const state = get();
  return {
    modelIds: state.zdrModelIds,
    providerIds: state.zdrProviderIds,
    fetchedAt: state.zdrFetchedAt,
  };
}

export function hydrateZdrCache<S extends ZdrCacheState>(
  set: StoreSetter<S>,
  lists: ZdrLists,
  fetchedAt?: number,
) {
  set(() => toZdrState(lists, fetchedAt ?? Date.now()) as Partial<S>);
}

// Concurrent callers share one endpoint fetch instead of each pulling the ~500 kB payload.
let inflightRefresh: Promise<ZdrLists> | null = null;

export async function refreshZdrListsIfNeeded<S extends ZdrCacheState>(
  set: StoreSetter<S>,
  get: StoreGetter<S>,
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
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = ensureZdrLists(undefined, fetchers)
    .then((lists) => {
      hydrateZdrCache(set, lists, now);
      return lists;
    })
    .finally(() => {
      inflightRefresh = null;
    });
  return inflightRefresh;
}

export async function computeZdrFilterCached<T extends { id?: string }, S extends ZdrCacheState>(
  models: T[],
  mode: ZdrFilterMode,
  set: StoreSetter<S>,
  get: StoreGetter<S>,
  fetchers?: ZdrFetchers,
): Promise<EnsureListsResult<T>> {
  const snapshot = getZdrCacheSnapshot(get);
  const lists = fetchers
    ? await refreshZdrListsIfNeeded(set, get, fetchers)
    : {
        modelIds: toSet(snapshot.modelIds),
        providerIds: toSet(snapshot.providerIds),
      };
  const filter = filterZdrModels(models, lists);
  const filtered = mode === 'enforce' ? filter.models : models;
  return { lists, filter, filtered };
}

export async function guardZdrOrNotifyCached<S extends ZdrCacheState>(
  modelId: string,
  set: StoreSetter<S>,
  get: StoreGetter<S>,
  fetchers?: ZdrFetchers,
): Promise<boolean> {
  if (!fetchers) return guardZdrOrNotify(modelId, set, get);
  const result = await computeZdrFilterCached([{ id: modelId }], 'enforce', set, get, fetchers);
  return guardModelOrNotice(
    modelId,
    set,
    result.lists,
    get().setNotice,
    zdrModelName(modelId, get),
  );
}

/** The cached lists only, so it answers before the composer lets go of the draft. */
export function guardZdrOrNotify<S extends ZdrCacheState>(
  modelId: string,
  set: StoreSetter<S>,
  get: StoreGetter<S>,
): boolean {
  const snapshot = getZdrCacheSnapshot(get);
  const lists = { modelIds: toSet(snapshot.modelIds), providerIds: toSet(snapshot.providerIds) };
  return guardModelOrNotice(modelId, set, lists, get().setNotice, zdrModelName(modelId, get));
}

function zdrModelName<S extends ZdrCacheState>(modelId: string, get: StoreGetter<S>): string {
  return formatModelLabel({ model: findModelById(get().models, modelId), fallbackId: modelId });
}

/**
 * The cached verdict without a notice, for background calls that skip quietly
 * rather than tell the person about a model they never picked.
 */
export function isZdrAllowedCached<S extends ZdrCacheState>(
  modelId: string,
  get: StoreGetter<S>,
): boolean {
  const snapshot = getZdrCacheSnapshot(get);
  const lists = { modelIds: toSet(snapshot.modelIds), providerIds: toSet(snapshot.providerIds) };
  return evaluateZdrModel(modelId, lists).status === 'allowed';
}
