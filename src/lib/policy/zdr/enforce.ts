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
import type { StoreSetter } from '@/lib/agent/types';
import type { EnsureListsResult, ZdrFilterMode } from './types';

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

export function guardModelOrNotice(
  modelId: string | undefined,
  set: StoreSetter,
  lists: ZdrLists,
): boolean {
  const trimmed = typeof modelId === 'string' ? modelId.trim() : '';
  if (!trimmed) {
    set((state) => ({
      ...toZdrState(lists),
      ui: { ...state.ui, notice: ZDR_UNAVAILABLE_NOTICE },
    }));
    return false;
  }
  const verdict = evaluateZdrModel(trimmed, lists);
  if (verdict.status === 'allowed') {
    set(() => toZdrState(lists));
    return true;
  }
  const notice = buildZdrNotice(trimmed, verdict);
  set((state) => ({
    ...toZdrState(lists),
    ui: { ...state.ui, notice },
  }));
  return false;
}
