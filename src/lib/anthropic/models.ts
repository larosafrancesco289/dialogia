import type { TransportAuth } from '@/lib/auth/transport';
import type { ModelDescriptor } from '@/lib/types';
import type { TransportFetchModelsOptions } from '@/lib/transport/types';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { isRecord } from '@/lib/utils/guards';
import { anFetchModels } from '@/lib/anthropic/http';
import { ANTHROPIC_ENDPOINT_ID } from '@/lib/transport/endpoints';
import { buildAnthropicError, wrapAnthropicClientError } from '@/lib/anthropic/errors';
import {
  documentedAnthropicEffortLevels,
  getAnthropicPricing,
  isAnthropicThinkingMandatory,
  readAnthropicCapabilityFlag,
  resolveAnthropicPublicModelId,
  supportsAnthropicAdaptiveThinking,
  supportsAnthropicReasoning,
  supportsAnthropicToolUse,
  supportsAnthropicVision,
  toAnthropicModelId,
} from '@/lib/anthropic/shared';

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

function extractEntries(payload: unknown): unknown[] {
  if (isRecord(payload)) {
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.models)) return payload.models;
  }
  return Array.isArray(payload) ? payload : [];
}

const EFFORT_LEVEL_KEYS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

/**
 * Normalize Anthropic's `capabilities.effort` flags into the same `reasoning`
 * metadata shape OpenRouter publishes, so the models layer reads one format.
 * The API default effort is `high` and cannot be read from metadata; the
 * effort docs state "omitting the parameter" equals `high` on all supported
 * models. Older manual-thinking models have thinking off by default.
 */
function buildAnthropicReasoningMetadata(
  directId: string,
  capabilities: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const effortCaps =
    capabilities && isRecord(capabilities.effort) ? capabilities.effort : undefined;
  const effortSupported = effortCaps
    ? (readAnthropicCapabilityFlag(capabilities, 'effort') ?? true)
    : supportsAnthropicAdaptiveThinking(directId);
  const supportedEfforts = effortSupported
    ? effortCaps
      ? EFFORT_LEVEL_KEYS.filter((level) => readAnthropicCapabilityFlag(effortCaps, level) === true)
      : documentedAnthropicEffortLevels(directId)
    : ['low', 'medium', 'high'];
  const mandatory = isAnthropicThinkingMandatory(directId);
  return {
    supported_efforts:
      supportedEfforts.length > 0 ? supportedEfforts : documentedAnthropicEffortLevels(directId),
    default_effort: 'high',
    // Effort-capable models run with reasoning active by default; older
    // manual-thinking models require explicitly enabling thinking.
    default_enabled: effortSupported || mandatory,
    mandatory,
    supports_max_tokens: !supportsAnthropicAdaptiveThinking(directId),
  };
}

function normalizeAnthropicModel(entry: unknown, endpointId: string): ModelDescriptor | null {
  if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) return null;
  const directId = entry.id;
  const publicId = resolveAnthropicPublicModelId(directId);
  const appId = toAnthropicModelId(publicId);
  const displayName =
    typeof entry.display_name === 'string'
      ? entry.display_name
      : typeof entry.name === 'string'
        ? entry.name
        : undefined;
  const capabilities = isRecord(entry.capabilities) ? entry.capabilities : undefined;
  const canReason =
    readAnthropicCapabilityFlag(capabilities, 'thinking', 'extended_thinking', 'reasoning') ??
    supportsAnthropicReasoning(directId);
  const canUseTools =
    readAnthropicCapabilityFlag(capabilities, 'tool_use', 'tools') ??
    supportsAnthropicToolUse(directId);
  const canSee =
    readAnthropicCapabilityFlag(capabilities, 'vision', 'image_input', 'images') ??
    supportsAnthropicVision(directId);

  const supportedParameters = Array.from(
    new Set([
      ...(Array.isArray(entry.supported_parameters)
        ? entry.supported_parameters.map((value) => String(value).toLowerCase())
        : []),
      ...(canReason ? ['reasoning'] : []),
      ...(canUseTools ? ['tools'] : []),
      ...(canSee ? ['vision'] : []),
    ]),
  );

  const raw = {
    ...entry,
    supported_parameters: supportedParameters,
    input_modalities: canSee ? ['text', 'image'] : ['text'],
    output_modalities: ['text'],
    ...(canReason ? { reasoning: buildAnthropicReasoningMetadata(directId, capabilities) } : {}),
    anthropic: {
      public_id: publicId,
      direct_id: directId,
    },
  };

  return {
    id: appId,
    name: displayName,
    context_length:
      typeof entry.max_input_tokens === 'number'
        ? entry.max_input_tokens
        : typeof entry.context_window === 'number'
          ? entry.context_window
          : undefined,
    pricing: getAnthropicPricing(publicId),
    raw,
    endpointId,
    transportModelId: directId,
    providerDisplay: 'Anthropic',
  };
}

export function clearAnthropicCachesForTest() {
  modelCache = new Map();
}

export async function fetchModels(
  auth: TransportAuth,
  opts: TransportFetchModelsOptions & { fetchFn?: typeof anFetchModels } = {},
): Promise<ModelDescriptor[]> {
  const fetchFn = opts.fetchFn ?? anFetchModels;
  const fingerprint = fingerprintKey(typeof auth.apiKey === 'string' ? auth.apiKey : '');
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
    throw wrapAnthropicClientError(error, API_ERROR_CODES.PROVIDER_MODELS_FAILED);
  }

  if (res.status === 401 || res.status === 403) {
    throw await buildAnthropicError(res, API_ERROR_CODES.UNAUTHORIZED, 'Invalid API key');
  }
  if (res.status === 429) {
    throw await buildAnthropicError(res, API_ERROR_CODES.RATE_LIMITED, 'Rate limited');
  }
  if (!res.ok) {
    throw await buildAnthropicError(res, API_ERROR_CODES.PROVIDER_MODELS_FAILED);
  }

  const data = await res.json().catch(() => null);
  const models = extractEntries(data)
    .map((entry) => normalizeAnthropicModel(entry, auth.endpoint?.id ?? ANTHROPIC_ENDPOINT_ID))
    .filter((entry): entry is ModelDescriptor => entry !== null);

  const deduped = Array.from(
    models
      .reduce((map, model) => {
        if (!map.has(model.id)) {
          map.set(model.id, model);
        }
        return map;
      }, new Map<string, ModelDescriptor>())
      .values(),
  );

  modelCache.set(cacheKey, { models: deduped, fetchedAt: now, origin: opts.origin });
  return deduped;
}
