import { API_ERROR_CODES } from '@/lib/api/errors';
import { orFetchZdrEndpoints } from '@/lib/openrouter/http';
import { parseZdrEndpoints, type ZdrEndpoint } from '@/lib/policy/zdr/parsing';
import { buildOpenRouterError, wrapOpenRouterClientError } from '@/lib/openrouter/errors';

async function fetchZdrEndpoints(
  signal?: AbortSignal,
  fetcher: typeof orFetchZdrEndpoints = orFetchZdrEndpoints,
): Promise<ZdrEndpoint[]> {
  let res: Response;
  try {
    res = await fetcher({ signal });
  } catch (error) {
    throw wrapOpenRouterClientError(error, API_ERROR_CODES.OPENROUTER_ZDR_FAILED);
  }
  if (!res.ok) {
    throw await buildOpenRouterError(res, API_ERROR_CODES.OPENROUTER_ZDR_FAILED);
  }
  const payload = await res.json().catch(() => null);
  return parseZdrEndpoints(payload);
}

// Provider prefixes (e.g., 'moonshotai') for endpoints that are Zero Data Retention
function deriveProviderIds(items: ZdrEndpoint[]): Set<string> {
  const providers = new Set<string>();
  for (const ep of items) {
    const tryAdd = (val: unknown) => {
      if (typeof val === 'string' && val.trim()) providers.add(val.trim());
    };
    tryAdd(ep.providerId);
    for (const modelId of ep.models) {
      if (modelId.includes('/')) tryAdd(modelId.split('/')[0]);
    }
    if (ep.id && ep.id.includes('/')) tryAdd(ep.id.split('/')[0]);
    const urlStr = ep.url;
    if (typeof urlStr === 'string') {
      const lower = urlStr.toLowerCase();
      if (lower.includes('moonshot')) providers.add('moonshotai');
      if (lower.includes('mistral')) providers.add('mistralai');
      if (lower.includes('perplexity')) providers.add('perplexity');
      if (lower.includes('openai')) providers.add('openai');
    }
  }
  return providers;
}

// Model ids that are explicitly ZDR-enabled, when provided by the endpoint
function deriveModelIds(items: ZdrEndpoint[]): Set<string> {
  const modelIds = new Set<string>();
  for (const ep of items) {
    if (ep.name && ep.name.includes('|')) {
      const rhs = ep.name.split('|')[1]?.trim();
      if (rhs && rhs.includes('/')) modelIds.add(rhs);
    }
    for (const id of ep.models) {
      if (id && id.includes('/')) modelIds.add(id);
    }
  }
  return modelIds;
}

/**
 * Fetch the ZDR endpoint list once and derive both lists from it. The payload is
 * ~500 kB, so callers must never fetch it twice to obtain the two projections.
 */
export async function fetchZdrLists(
  fetcher: typeof orFetchZdrEndpoints = orFetchZdrEndpoints,
): Promise<{ modelIds: Set<string>; providerIds: Set<string> }> {
  try {
    const items = await fetchZdrEndpoints(undefined, fetcher);
    return { modelIds: deriveModelIds(items), providerIds: deriveProviderIds(items) };
  } catch {
    return { modelIds: new Set<string>(), providerIds: new Set<string>() };
  }
}
