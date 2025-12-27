import {
  ensureZdrLists,
  evaluateZdrModel,
  filterZdrModels,
  getZdrBlockNotice,
  toZdrState,
  ZDR_UNAVAILABLE_NOTICE,
  type ZdrFetchers,
  type ZdrLists,
} from './index';
import type { StoreSetter as ContractStoreSetter } from '@/lib/agent/contracts';
import type { EnsureListsResult, ZdrFilterMode } from './types';

// Minimal state type for ZDR enforcement
type ZdrEnforceState = {
  zdrModelIds?: string[];
  zdrProviderIds?: string[];
  zdrFetchedAt?: number;
  ui: { notice?: string };
};

type StoreSetter<S extends ZdrEnforceState = ZdrEnforceState> = ContractStoreSetter<S>;

export async function computeZdrFilter<T extends { id?: string }>(
  models: T[],
  mode: ZdrFilterMode = 'informational',
  existing?: { modelIds?: Iterable<string> | null; providerIds?: Iterable<string> | null },
  fetchers?: ZdrFetchers,
): Promise<EnsureListsResult<T>> {
  const lists = await ensureZdrLists(existing, fetchers);
  const filter = filterZdrModels(models, lists);
  const filtered = mode === 'enforce' ? filter.models : models;
  return { lists, filter, filtered };
}

export function buildZdrNotice(
  modelId: string,
  verdict: { status: 'unknown' } | { status: 'forbidden'; reason: 'model' | 'provider' },
): string {
  if (verdict.status === 'unknown') return ZDR_UNAVAILABLE_NOTICE;
  return getZdrBlockNotice(modelId, verdict.reason);
}

export function guardModelOrNotice<S extends ZdrEnforceState>(
  modelId: string | undefined,
  set: StoreSetter<S>,
  lists: ZdrLists,
): boolean {
  const trimmed = typeof modelId === 'string' ? modelId.trim() : '';
  if (!trimmed) {
    set(
      (state) =>
        ({
          ...toZdrState(lists),
          ui: { ...state.ui, notice: ZDR_UNAVAILABLE_NOTICE },
        }) as Partial<S>,
    );
    return false;
  }
  const verdict = evaluateZdrModel(trimmed, lists);
  if (verdict.status === 'allowed') {
    set(() => toZdrState(lists) as Partial<S>);
    return true;
  }
  const notice = buildZdrNotice(trimmed, verdict);
  set(
    (state) =>
      ({
        ...toZdrState(lists),
        ui: { ...state.ui, notice },
      }) as Partial<S>,
  );
  return false;
}
