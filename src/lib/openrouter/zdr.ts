import { API_ERROR_CODES } from '@/lib/api/errors';
import { orFetchZdrEndpoints } from '@/lib/api/openrouterHttp';
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

// Fetch provider identifiers for endpoints that are Zero Data Retention (ZDR)
// Returns a set of provider prefixes (e.g., 'moonshotai') to match against model ids
export async function fetchZdrProviderIds(
  fetcher: typeof orFetchZdrEndpoints = orFetchZdrEndpoints,
): Promise<Set<string>> {
  try {
    const items = await fetchZdrEndpoints(undefined, fetcher);
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
  } catch {
    return new Set();
  }
}

// Fetch a set of model ids that are explicitly ZDR-enabled, when provided by the endpoint
export async function fetchZdrModelIds(
  fetcher: typeof orFetchZdrEndpoints = orFetchZdrEndpoints,
): Promise<Set<string>> {
  try {
    const items = await fetchZdrEndpoints(undefined, fetcher);
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
  } catch {
    return new Set();
  }
}
