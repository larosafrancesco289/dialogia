import type { StoreState } from '@/lib/store/types';
import {
  ensureZdrLists,
  evaluateZdrModel,
  filterZdrModels,
  getZdrBlockNotice,
  toZdrState,
  ZDR_UNAVAILABLE_NOTICE,
  type ZdrFilterResult,
  type ZdrLists,
} from '@/lib/zdr';
import type { StoreSetter } from '@/lib/agent/types';

export type ZdrFilterMode = 'enforce' | 'informational';

export type EnsureListsResult<T> = {
  lists: ZdrLists;
  filter: ZdrFilterResult<T>;
  filtered: T[];
};

export async function ensureListsAndFilter<T extends { id?: string }>(
  models: T[],
  mode: ZdrFilterMode = 'informational',
  existing?: { modelIds?: Iterable<string> | null; providerIds?: Iterable<string> | null },
): Promise<EnsureListsResult<T>> {
  const lists = await ensureZdrLists(existing);
  const filter = filterZdrModels(models, lists);
  const filtered = mode === 'enforce' ? filter.models : models;
  return { lists, filter, filtered };
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
  const notice =
    verdict.status === 'unknown'
      ? ZDR_UNAVAILABLE_NOTICE
      : getZdrBlockNotice(trimmed, verdict.reason);
  set((state) => ({
    ...toZdrState(lists),
    ui: { ...state.ui, notice },
  }));
  return false;
}
