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
import { ZDR_CACHE_TTL_MS } from '@/lib/policy/zdr/constants';

// Transport-only client for OpenRouter.
// Request payload construction lives in agent/request.buildChatBody to keep one source of truth
// between debug captures and outbound network requests.

const MODEL_CACHE_TTL_MS = 1000 * 60 * 5;
let modelCache = new Map<string, { models: ORModel[]; fetchedAt: number; origin?: string }>();
let zdrEndpointCache: { endpoints: any[]; fetchedAt: number } | null = null;

async function loadZdrEndpoints(
  signal?: AbortSignal,
  fetcher: typeof orFetchZdrEndpoints = orFetchZdrEndpoints,
): Promise<any[]> {
  const now = Date.now();
  if (zdrEndpointCache && now - zdrEndpointCache.fetchedAt < ZDR_CACHE_TTL_MS) {
    return zdrEndpointCache.endpoints;
  }
  const res = await fetcher({ signal });
  if (!res.ok) throw responseError(res, { code: API_ERROR_CODES.OPENROUTER_ZDR_FAILED });
  const payload = await res.json().catch(() => null);
  if (!payload) return [];
  const endpoints = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.endpoints)
      ? payload.endpoints
      : Array.isArray(payload)
        ? payload
        : [];
  zdrEndpointCache = { endpoints, fetchedAt: now };
  return endpoints;
}

// Fetch provider identifiers for endpoints that are Zero Data Retention (ZDR)
// Returns a set of provider prefixes (e.g., 'moonshotai') to match against model ids
export async function fetchZdrProviderIds(
  fetcher: typeof orFetchZdrEndpoints = orFetchZdrEndpoints,
): Promise<Set<string>> {
  try {
    const items = await loadZdrEndpoints(undefined, fetcher);
    const providers = new Set<string>();
    for (const ep of items) {
      const tryAdd = (val: unknown) => {
        if (typeof val === 'string' && val.trim()) providers.add(val.trim());
      };
      tryAdd((ep && (ep.provider || ep.provider_id || ep.slug || ep.id)) as any);
      const models: any[] = Array.isArray(ep?.models) ? ep.models : [];
      for (const m of models) {
        const id: string | undefined = typeof m === 'string' ? m : m?.id;
        if (id && id.includes('/')) tryAdd(id.split('/')[0]);
      }
      const eid: string | undefined = ep?.id;
      if (eid && eid.includes('/')) tryAdd(eid.split('/')[0]);
      const urlStr: string | undefined = ep?.url || ep?.endpoint || ep?.base_url;
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
    const items = await loadZdrEndpoints(undefined, fetcher);
    const modelIds = new Set<string>();
    for (const ep of items) {
      if (typeof ep?.name === 'string' && ep.name.includes('|')) {
        const rhs = ep.name.split('|')[1]?.trim();
        if (rhs && rhs.includes('/')) modelIds.add(rhs);
      }
      const models: any[] = Array.isArray(ep?.models) ? ep.models : [];
      for (const m of models) {
        const id = typeof m === 'string' ? m : typeof m?.id === 'string' ? m.id : undefined;
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
  zdrEndpointCache = null;
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
  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : data;
  const models = (items as any[]).map((m) => ({
    id: m.id,
    name: m.name,
    context_length: m.context_length,
    pricing: m.pricing,
    raw: m,
    transport: 'openrouter' as const,
    transportModelId: m.id,
    providerDisplay: 'OpenRouter',
  }));
  modelCache.set(cacheKey, { models, fetchedAt: now, origin: opts.origin });
  return models;
}

export type StreamCallbacks = {
  onStart?: () => void;
  onToken?: (delta: string) => void;
  onReasoningToken?: (delta: string) => void;
  onImage?: (dataUrl: string) => void; // base64 data URL for generated image
  onAnnotations?: (annotations: any) => void;
  onDone?: (full: string, extras?: { usage?: any; annotations?: any }) => void;
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
  let annotations: any | undefined;

  const emitImages = (arr: any[]) => {
    for (const img of arr || []) {
      const url: string | undefined = img?.image_url?.url || img?.url;
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
      const choice = json.choices?.[0] ?? {};
      const delta = choice?.delta ?? {};
      const message = choice?.message ?? {};

      const deltaContent: string =
        typeof delta.content === 'string'
          ? delta.content
          : typeof message.content === 'string'
            ? message.content
            : '';

      const deltaReasoning: string =
        typeof (delta as any).reasoning === 'string'
          ? (delta as any).reasoning
          : typeof (message as any).reasoning === 'string'
            ? (message as any).reasoning
            : '';

      const ann = (delta as any)?.annotations || (message as any)?.annotations;
      if (ann && !annotations) {
        annotations = ann;
        callbacks?.onAnnotations?.(ann);
      }

      if (Array.isArray(delta?.images)) emitImages(delta.images as any[]);
      if (Array.isArray((message as any)?.images)) emitImages((message as any).images as any[]);

      if (deltaReasoning) callbacks?.onReasoningToken?.(deltaReasoning);
      if (deltaContent) {
        full += deltaContent;
        callbacks?.onToken?.(deltaContent);
      }

      if (json.usage) usage = normalizeUsage(json.usage);
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
      error instanceof Error ? error : new ApiError({ code: API_ERROR_CODES.OPENROUTER_CHAT_FAILED }),
    );
    throw error;
  }

  callbacks?.onDone?.(full, { usage, annotations });
}
