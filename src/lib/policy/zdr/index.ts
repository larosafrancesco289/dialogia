import { fetchZdrLists } from '@/lib/openrouter';
import { findModelEndpoint } from '@/lib/transport/endpointRegistry';
import type { ProviderEndpoint } from '@/lib/transport/endpoints';

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

// This machine, or the local network: loopback, private ranges, .local names.
const LOCAL_HOST_RE =
  /^(?:localhost|.+\.localhost|.+\.local|::1|127(?:\.\d+){3}|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2})$/i;

/**
 * Whether the endpoint is the person's own server on this machine or their
 * network. What it is sent stays with them, so it has no retention for zero
 * data retention to rule out; a server elsewhere is a provider like any other.
 */
export function isLocalServer(endpoint?: Pick<ProviderEndpoint, 'kind' | 'baseUrl'>): boolean {
  if (endpoint?.kind !== 'openai-compatible' || !endpoint.baseUrl) return false;
  try {
    return LOCAL_HOST_RE.test(new URL(endpoint.baseUrl).hostname.replace(/^\[|\]$/g, ''));
  } catch {
    return false;
  }
}

export function evaluateZdrModel(modelId: string, lists: ZdrLists): ZdrCheck {
  const trimmed = modelId.trim();
  if (!trimmed) return { status: 'forbidden', reason: 'model' };
  if (isLocalServer(findModelEndpoint(trimmed))) return { status: 'allowed' };
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

export function getZdrBlockNotice(modelName: string): string {
  return `${modelName} does not promise zero data retention. Pick another model, or turn off Zero data retention only in Settings › Models.`;
}

export const ZDR_UNAVAILABLE_NOTICE =
  'Could not check which providers keep no data. Check your connection, or turn off Zero data retention only in Settings › Models.';
