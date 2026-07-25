import type { TransportAuth } from '@/lib/auth/transport';
import type { ModelDescriptor } from '@/lib/types';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { orFetchModels } from '@/lib/openrouter/http';
import type { TransportFetchModelsOptions } from '@/lib/transport/types';
import { normalizeModelList } from '@/lib/models/normalization';
import { buildOpenRouterError, wrapOpenRouterClientError } from '@/lib/openrouter/errors';

const MODEL_CACHE_TTL_MS = 1000 * 60 * 5;
let modelCache = new Map<
  string,
  { models: ModelDescriptor[]; fetchedAt: number; origin?: string }
>();

const fingerprintKey = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

export function clearOpenRouterCachesForTest() {
  modelCache = new Map();
}

type OpenRouterFetchModelsOptions = TransportFetchModelsOptions & {
  fetchFn?: typeof orFetchModels;
};

export async function fetchModels(
  auth: TransportAuth,
  opts: OpenRouterFetchModelsOptions = {},
): Promise<ModelDescriptor[]> {
  const fetchFn = opts.fetchFn ?? orFetchModels;
  const fingerprint = auth.endpoint.useProxy
    ? 'proxy'
    : fingerprintKey(typeof auth.apiKey === 'string' ? auth.apiKey : '');
  const cacheKey = `${opts.origin || 'default'}::${fingerprint}`;
  const cached = modelCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.models;
  }

  let res: Response;
  try {
    res = await fetchFn(auth, { signal: opts.signal, origin: opts.origin });
  } catch (error) {
    throw wrapOpenRouterClientError(error, API_ERROR_CODES.OPENROUTER_MODELS_FAILED);
  }
  if (res.status === 401 || res.status === 403) {
    throw await buildOpenRouterError(res, API_ERROR_CODES.UNAUTHORIZED, 'Invalid API key');
  }
  if (!res.ok) {
    throw await buildOpenRouterError(res, API_ERROR_CODES.OPENROUTER_MODELS_FAILED);
  }
  const data = await res.json().catch(() => null);
  const models = normalizeModelList(data, {
    endpointId: auth.endpoint.id,
    providerDisplay: auth.endpoint.label,
  });
  modelCache.set(cacheKey, { models, fetchedAt: now, origin: opts.origin });
  return models;
}
