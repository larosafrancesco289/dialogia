import {
  evaluateZdrModel,
  getZdrBlockNotice,
  toZdrState,
  ZDR_UNAVAILABLE_NOTICE,
  type ZdrLists,
} from './index';
import type { StoreSetter as ContractStoreSetter } from '@/lib/contracts/store';

// Minimal state type for ZDR enforcement
type ZdrEnforceState = {
  zdrModelIds?: string[];
  zdrProviderIds?: string[];
  zdrFetchedAt?: number;
  ui: { notice?: string };
};

type StoreSetter<S extends ZdrEnforceState = ZdrEnforceState> = ContractStoreSetter<S>;

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
  setNotice: (notice?: string) => void,
): boolean {
  const trimmed = typeof modelId === 'string' ? modelId.trim() : '';
  if (!trimmed) {
    set((state) => ({ ...toZdrState(lists), ui: { ...state.ui } }) as Partial<S>);
    setNotice(ZDR_UNAVAILABLE_NOTICE);
    return false;
  }
  const verdict = evaluateZdrModel(trimmed, lists);
  if (verdict.status === 'allowed') {
    set(() => toZdrState(lists) as Partial<S>);
    return true;
  }
  const notice = buildZdrNotice(trimmed, verdict);
  set((state) => ({ ...toZdrState(lists), ui: { ...state.ui } }) as Partial<S>);
  setNotice(notice);
  return false;
}
