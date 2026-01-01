import type { ModelDescriptor } from '@/lib/types';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { orFetchModels } from '@/lib/openrouter/http';
import type { TransportFetchModelsOptions } from '@/lib/transport/types';
import { isRecord } from '@/lib/utils/guards';
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

const parsePricing = (
  value: unknown,
): { prompt?: number; completion?: number; currency?: string } | undefined => {
  if (!isRecord(value)) return undefined;
  const prompt = typeof value.prompt === 'number' ? value.prompt : undefined;
  const completion = typeof value.completion === 'number' ? value.completion : undefined;
  const currency = typeof value.currency === 'string' ? value.currency : undefined;
  if (prompt == null && completion == null && currency == null) return undefined;
  return { prompt, completion, currency };
};

const parseModelList = (payload: unknown): ModelDescriptor[] => {
  const items = isRecord(payload)
    ? Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : Array.isArray(payload)
          ? payload
          : []
    : Array.isArray(payload)
      ? payload
      : [];

  return items
    .map((entry): ModelDescriptor | null => {
      if (!isRecord(entry)) return null;
      const id = typeof entry.id === 'string' ? entry.id : '';
      if (!id) return null;
      const name = typeof entry.name === 'string' ? entry.name : undefined;
      const context_length =
        typeof entry.context_length === 'number' ? entry.context_length : undefined;
      return {
        id,
        name,
        context_length,
        pricing: parsePricing(entry.pricing),
        raw: entry,
        transport: 'openrouter' as const,
        transportModelId: id,
        providerDisplay: 'OpenRouter',
      };
    })
    .filter((model): model is ModelDescriptor => model !== null);
};

export function clearOpenRouterCachesForTest() {
  modelCache = new Map();
}

type OpenRouterFetchModelsOptions = TransportFetchModelsOptions & {
  fetchFn?: typeof orFetchModels;
};

export async function fetchModels(
  apiKey: string,
  opts: OpenRouterFetchModelsOptions = {},
): Promise<ModelDescriptor[]> {
  const fetchFn = opts.fetchFn ?? orFetchModels;
  const cacheKey = `${opts.origin || 'default'}::${fingerprintKey(apiKey)}`;
  const cached = modelCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.models;
  }

  let res: Response;
  try {
    res = await fetchFn(apiKey, { signal: opts.signal, origin: opts.origin });
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
  const models = parseModelList(data);
  modelCache.set(cacheKey, { models, fetchedAt: now, origin: opts.origin });
  return models;
}
