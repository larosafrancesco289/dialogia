import { fetchZdrLists } from '@/lib/openrouter';

export type ZdrLists = {
  modelIds: Set<string>;
  providerIds: Set<string>;
};

export type ZdrCheck =
  | { status: 'allowed' }
  | { status: 'forbidden'; reason: 'model' | 'provider' }
  | { status: 'unknown' };

export type ZdrFilterResult<T> =
  | { status: 'model'; models: T[] }
  | { status: 'provider'; models: T[] }
  | { status: 'unknown'; models: T[] };

const PROVIDER_SPLIT = '/';

function toSet(values?: Iterable<string> | null): Set<string> {
  if (!values) return new Set<string>();
  return new Set<string>(Array.from(values).filter((v) => typeof v === 'string' && v.trim()));
}

function getProviderFromModel(modelId: string): string {
  return modelId.split(PROVIDER_SPLIT)[0] || '';
}

export type ZdrFetchers = {
  fetchLists?: () => Promise<ZdrLists>;
};

export async function ensureZdrLists(
  existing?: {
    modelIds?: Iterable<string> | null;
    providerIds?: Iterable<string> | null;
  },
  fetchers?: ZdrFetchers,
): Promise<ZdrLists> {
  const modelIds = toSet(existing?.modelIds);
  const providerIds = toSet(existing?.providerIds);

  const needsModels = modelIds.size === 0;
  const needsProviders = providerIds.size === 0;
  if (!needsModels && !needsProviders) return { modelIds, providerIds };

  const fetchLists = fetchers?.fetchLists ?? fetchZdrLists;
  const fetched = await fetchLists().catch(() => ({
    modelIds: new Set<string>(),
    providerIds: new Set<string>(),
  }));

  return {
    modelIds: needsModels ? fetched.modelIds : modelIds,
    providerIds: needsProviders ? fetched.providerIds : providerIds,
  };
}

export function evaluateZdrModel(modelId: string, lists: ZdrLists): ZdrCheck {
  const trimmed = modelId.trim();
  if (!trimmed) return { status: 'forbidden', reason: 'model' };
  if (lists.modelIds.size > 0) {
    return lists.modelIds.has(trimmed)
      ? { status: 'allowed' }
      : { status: 'forbidden', reason: 'model' };
  }
  if (lists.providerIds.size > 0) {
    const provider = getProviderFromModel(trimmed);
    return provider && lists.providerIds.has(provider)
      ? { status: 'allowed' }
      : { status: 'forbidden', reason: 'provider' };
  }
  return { status: 'unknown' };
}

export async function checkZdrModelAllowance(
  modelId: string,
  existing?: { modelIds?: Iterable<string> | null; providerIds?: Iterable<string> | null },
): Promise<{ lists: ZdrLists; check: ZdrCheck }> {
  const lists = await ensureZdrLists(existing);
  const check = evaluateZdrModel(modelId, lists);
  return { lists, check };
}

export function filterZdrModels<T extends { id?: string }>(
  models: T[],
  lists: ZdrLists,
): ZdrFilterResult<T> {
  if (lists.modelIds.size > 0) {
    return {
      status: 'model',
      models: models.filter((m) => (m.id ? lists.modelIds.has(m.id) : false)),
    };
  }
  if (lists.providerIds.size > 0) {
    return {
      status: 'provider',
      models: models.filter((m) => {
        if (!m.id) return false;
        const provider = getProviderFromModel(m.id);
        return provider ? lists.providerIds.has(provider) : false;
      }),
    };
  }
  return { status: 'unknown', models: [] };
}

export function toZdrState(
  lists: ZdrLists,
  fetchedAt: number = Date.now(),
): { zdrModelIds: string[]; zdrProviderIds: string[]; zdrFetchedAt: number } {
  return {
    zdrModelIds: Array.from(lists.modelIds),
    zdrProviderIds: Array.from(lists.providerIds),
    zdrFetchedAt: fetchedAt,
  };
}

export function getZdrBlockNotice(modelId: string, reason: 'model' | 'provider'): string {
  if (reason === 'provider') {
    return `ZDR-only is enabled. The selected model (\n${modelId}\n) is not from a ZDR provider. Choose a ZDR model in Settings.`;
  }
  return `ZDR-only is enabled. The selected model (\n${modelId}\n) is not ZDR. Choose a ZDR model in Settings.`;
}

export const ZDR_UNAVAILABLE_NOTICE =
  'Could not fetch ZDR list; enable internet or disable ZDR-only to list all.';

export const ZDR_NO_MATCH_NOTICE = 'ZDR-only is enabled. None of the selected models are ZDR.';

export { computeZdrFilter, guardModelOrNotice, buildZdrNotice } from './enforce';
export { computeZdrFilterCached, guardZdrOrNotifyCached, refreshZdrListsIfNeeded } from './cache';
