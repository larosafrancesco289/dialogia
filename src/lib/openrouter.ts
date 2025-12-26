import type { ORModel } from '@/lib/types';
import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/agent/types';
import type { ProviderSort } from '@/lib/models/providerSort';
import {
  orChatCompletions,
  orFetchModels,
  orFetchZdrEndpoints,
  type ChatCompletionPayload,
} from '@/lib/api/openrouterClient';
import { buildChatBody } from '@/lib/agent/request';
import { consumeSse, type SseEvent } from '@/lib/api/stream';
import { ApiError, API_ERROR_CODES, responseError } from '@/lib/api/errors';
import { normalizeUsage, shouldIncludeUsage, type Usage } from '@/lib/api/normalizers';
import { parseZdrEndpoints, type ZdrEndpoint } from '@/lib/policy/zdr/parsing';

// Transport-only client for OpenRouter.
// Request payload construction lives in agent/request.buildChatBody to keep one source of truth
// between debug captures and outbound network requests.

const MODEL_CACHE_TTL_MS = 1000 * 60 * 5;
let modelCache = new Map<string, { models: ORModel[]; fetchedAt: number; origin?: string }>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

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

const parseModelList = (payload: unknown): ORModel[] => {
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
    .map((entry): ORModel | null => {
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
    .filter((model): model is ORModel => model !== null);
};

async function fetchZdrEndpoints(
  signal?: AbortSignal,
  fetcher: typeof orFetchZdrEndpoints = orFetchZdrEndpoints,
): Promise<ZdrEndpoint[]> {
  const res = await fetcher({ signal });
  if (!res.ok) throw responseError(res, { code: API_ERROR_CODES.OPENROUTER_ZDR_FAILED });
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
  } catch (_e) {
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
  } catch (_e) {
    return new Set();
  }
}

export function clearOpenRouterCachesForTest() {
  modelCache = new Map();
}

export async function fetchModels(
  apiKey: string,
  opts: { origin?: string; signal?: AbortSignal; fetchFn?: typeof orFetchModels } = {},
): Promise<ORModel[]> {
  const fetchFn = opts.fetchFn ?? orFetchModels;
  const cacheKey = `${opts.origin || 'default'}::${apiKey}`;
  const cached = modelCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.models;
  }

  const res = await fetchFn(apiKey, { signal: opts.signal, origin: opts.origin });
  if (res.status === 401 || res.status === 403) {
    throw responseError(res, {
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid API key',
    });
  }
  if (!res.ok) {
    throw responseError(res, { code: API_ERROR_CODES.OPENROUTER_MODELS_FAILED });
  }
  const data = await res.json().catch(() => null);
  const models = parseModelList(data);
  modelCache.set(cacheKey, { models, fetchedAt: now, origin: opts.origin });
  return models;
}

export type StreamCallbacks = {
  onStart?: () => void;
  onToken?: (delta: string) => void;
  onReasoningToken?: (delta: string) => void;
  onImage?: (dataUrl: string) => void; // base64 data URL for generated image
  onAnnotations?: (annotations: unknown) => void;
  onDone?: (full: string, extras?: { usage?: Usage; annotations?: unknown }) => void;
  onError?: (err: Error) => void;
};

// OpenAI-compatible non-streaming chat completion with optional tool support
export async function chatCompletion(params: {
  apiKey: string;
  model: string;
  // Loosen type to allow multimodal content arrays and tool roles
  messages: ModelMessage[];
  // Enable image generation when model supports it
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | { type: 'function'; function: { name: string } };
  parallel_tool_calls?: boolean;
  signal?: AbortSignal;
  providerSort?: ProviderSort;
  plugins?: PluginConfig[];
  origin?: string;
}): Promise<ChatCompletionPayload> {
  const body = buildChatBody({
    model: params.model,
    messages: params.messages,
    stream: false,
    modalities: params.modalities,
    temperature: params.temperature,
    top_p: params.top_p,
    max_tokens: params.max_tokens,
    reasoning_effort: params.reasoning_effort,
    reasoning_tokens: params.reasoning_tokens,
    tools: params.tools,
    tool_choice: params.tool_choice,
    parallel_tool_calls: params.parallel_tool_calls,
    providerSort: params.providerSort,
    plugins: params.plugins,
  });
  const res = await orChatCompletions({
    apiKey: params.apiKey,
    body,
    signal: params.signal,
    origin: params.origin,
  });
  if (res.status === 401 || res.status === 403)
    throw responseError(res, { code: API_ERROR_CODES.UNAUTHORIZED, message: 'Invalid API key' });
  if (res.status === 429)
    throw responseError(res, { code: API_ERROR_CODES.RATE_LIMITED, message: 'Rate limited' });
  if (!res.ok) throw responseError(res, { code: API_ERROR_CODES.OPENROUTER_CHAT_FAILED });
  const payload: ChatCompletionPayload = await res.json();
  return payload;
}

export async function streamChatCompletion(params: {
  apiKey: string;
  model: string;
  // Allow multimodal content arrays
  messages: ModelMessage[];
  // Enable image generation when model supports it
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  // Reasoning configuration (optional)
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  // Tool calling (optional)
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallel_tool_calls?: boolean;
  signal?: AbortSignal;
  callbacks?: StreamCallbacks;
  providerSort?: ProviderSort;
  plugins?: PluginConfig[];
  origin?: string;
}) {
  const callbacks = params.callbacks;
  const body = buildChatBody({
    model: params.model,
    messages: params.messages,
    stream: true,
    modalities: params.modalities,
    temperature: params.temperature,
    top_p: params.top_p,
    max_tokens: params.max_tokens,
    reasoning_effort: params.reasoning_effort,
    reasoning_tokens: params.reasoning_tokens,
    tools: params.tools,
    tool_choice: params.tool_choice,
    parallel_tool_calls: params.parallel_tool_calls,
    providerSort: params.providerSort,
    plugins: params.plugins,
    includeUsage: shouldIncludeUsage(true),
  });

  const res = await orChatCompletions({
    apiKey: params.apiKey,
    body,
    signal: params.signal,
    stream: true,
    origin: params.origin,
  });

  if (res.status === 401 || res.status === 403)
    throw responseError(res, { code: API_ERROR_CODES.UNAUTHORIZED, message: 'Invalid API key' });
  if (res.status === 429)
    throw responseError(res, { code: API_ERROR_CODES.RATE_LIMITED, message: 'Rate limited' });
  if (!res.ok) throw responseError(res, { code: API_ERROR_CODES.OPENROUTER_CHAT_FAILED });

  let full = '';
  let usage: Usage | undefined;
  let annotations: unknown;

  const emitImages = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const img of arr) {
      if (!isRecord(img)) continue;
      const imageUrl = isRecord(img.image_url) ? img.image_url.url : undefined;
      const url =
        typeof imageUrl === 'string'
          ? imageUrl
          : typeof img.url === 'string'
            ? img.url
            : undefined;
      if (typeof url === 'string' && url.startsWith('data:image/')) {
        callbacks?.onImage?.(url);
      }
    }
  };

  const handleMessage = (event: SseEvent) => {
    const payload = event?.data;
    if (!payload) return;
    try {
      const json = JSON.parse(payload);
      if (!isRecord(json)) return;
      const choices = Array.isArray(json.choices) ? json.choices : [];
      const choice = isRecord(choices[0]) ? choices[0] : undefined;
      const delta = choice && isRecord(choice.delta) ? choice.delta : undefined;
      const message = choice && isRecord(choice.message) ? choice.message : undefined;

      const deltaContent =
        typeof delta?.content === 'string'
          ? delta.content
          : typeof message?.content === 'string'
            ? message.content
            : '';

      const deltaReasoning =
        typeof delta?.reasoning === 'string'
          ? delta.reasoning
          : typeof message?.reasoning === 'string'
            ? message.reasoning
            : '';

      const ann = delta?.annotations ?? message?.annotations;
      if (ann !== undefined && annotations === undefined) {
        annotations = ann;
        callbacks?.onAnnotations?.(ann);
      }

      emitImages(delta?.images);
      emitImages(message?.images);

      if (deltaReasoning) callbacks?.onReasoningToken?.(deltaReasoning);
      if (deltaContent) {
        full += deltaContent;
        callbacks?.onToken?.(deltaContent);
      }

      if (isRecord(json.usage)) usage = normalizeUsage(json.usage as Record<string, number>);
    } catch {
      // swallow malformed chunk
    }
  };

  try {
    await consumeSse(res, {
      onStart: callbacks?.onStart,
      onMessage: handleMessage,
    });
  } catch (error) {
    callbacks?.onError?.(
      error instanceof Error
        ? error
        : new ApiError({ code: API_ERROR_CODES.OPENROUTER_CHAT_FAILED }),
    );
    throw error;
  }

  callbacks?.onDone?.(full, { usage, annotations });
}
