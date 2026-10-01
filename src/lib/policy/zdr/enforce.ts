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

export function guardModelOrNotice<S extends ZdrEnforceState>(
  modelId: string | undefined,
  set: StoreSetter<S>,
  lists: ZdrLists,
  setNotice: (notice?: string) => void,
  modelName: string,
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
  const notice =
    verdict.status === 'unknown' ? ZDR_UNAVAILABLE_NOTICE : getZdrBlockNotice(modelName);
  set((state) => ({ ...toZdrState(lists), ui: { ...state.ui } }) as Partial<S>);
  setNotice(notice);
  return false;
}
