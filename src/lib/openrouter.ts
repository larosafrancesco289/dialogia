import type { ORModel } from '@/lib/types';
import { orChatCompletions, orFetchModels, orFetchZdrEndpoints } from '@/lib/api/openrouterClient';
import { buildChatBody } from '@/lib/agent/request';

// Transport-only client for OpenRouter.
// Request payload construction lives in agent/request.buildChatBody to keep one source of truth
// between debug captures and outbound network requests.

async function loadZdrEndpoints(signal?: AbortSignal): Promise<any[]> {
  const res = await orFetchZdrEndpoints({ signal });
  if (!res.ok) throw new Error(`zdr_failed_${res.status}`);
  const payload = await res.json().catch(() => null);
  if (!payload) return [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.endpoints)) return payload.endpoints;
  if (Array.isArray(payload)) return payload;
  return [];
}

// Fetch provider identifiers for endpoints that are Zero Data Retention (ZDR)
// Returns a set of provider prefixes (e.g., 'moonshotai') to match against model ids
export async function fetchZdrProviderIds(): Promise<Set<string>> {
  try {
    const items = await loadZdrEndpoints();
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
export async function fetchZdrModelIds(): Promise<Set<string>> {
  try {
    const items = await loadZdrEndpoints();
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

export async function fetchModels(apiKey: string): Promise<ORModel[]> {
  const res = await orFetchModels(apiKey);
  if (res.status === 401 || res.status === 403) {
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    throw new Error(`models_failed_${res.status}`);
  }
  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : data;
  return (items as any[]).map((m) => ({
    id: m.id,
    name: m.name,
    context_length: m.context_length,
    pricing: m.pricing,
    raw: m,
  }));
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
  messages: any[];
  // Enable image generation when model supports it
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  tools?: any[];
  tool_choice?: 'auto' | { type: 'function'; function: { name: string } };
  parallel_tool_calls?: boolean;
  signal?: AbortSignal;
  providerSort?: 'price' | 'throughput';
  plugins?: any[];
}) {
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
  const res = await orChatCompletions({ apiKey: params.apiKey, body, signal: params.signal });
  if (res.status === 401 || res.status === 403) throw new Error('unauthorized');
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok) throw new Error(`chat_failed_${res.status}`);
  return res.json();
}

export async function streamChatCompletion(params: {
  apiKey: string;
  model: string;
  // Allow multimodal content arrays
  messages: any[];
  // Enable image generation when model supports it
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  // Reasoning configuration (optional)
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  // Tool calling (optional)
  tools?: any[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallel_tool_calls?: boolean;
  signal?: AbortSignal;
  callbacks?: StreamCallbacks;
  providerSort?: 'price' | 'throughput';
  plugins?: any[];
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
    includeUsage: true,
  });
  const res = await orChatCompletions({
    apiKey: params.apiKey,
    body,
    signal: params.signal,
    stream: true,
  });

  if (res.status === 401 || res.status === 403) throw new Error('unauthorized');
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok || !res.body) throw new Error(`chat_failed_${res.status}`);

  callbacks?.onStart?.();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let reasoning = '';
  let usage: any | undefined;
  let annotations: any | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') {
        callbacks?.onDone?.(full, { usage });
        return;
      }
      try {
        const json = JSON.parse(data);
        const choice = json.choices?.[0] ?? {};
        // Prefer delta fields during streaming; fall back to message.* if provider sends final chunk as full message
        let deltaContent: string = '';
        if (choice?.delta && typeof choice.delta.content === 'string')
          deltaContent = choice.delta.content;
        else if (choice?.message && typeof choice.message.content === 'string')
          deltaContent = choice.message.content;

        let deltaReasoning: string = '';
        if (choice?.delta && typeof choice.delta.reasoning === 'string')
          deltaReasoning = choice.delta.reasoning;
        else if (choice?.message && typeof choice.message.reasoning === 'string')
          deltaReasoning = choice.message.reasoning;

        // Capture annotations (PDF parsing metadata) when present
        const ann = (choice?.delta as any)?.annotations || (choice?.message as any)?.annotations;
        if (ann && !annotations) {
          annotations = ann;
          callbacks?.onAnnotations?.(ann);
        }

        // Handle streaming image outputs
        const emitImages = (arr: any[]) => {
          for (const img of arr || []) {
            const url: string | undefined = img?.image_url?.url || img?.url;
            if (typeof url === 'string' && url.startsWith('data:image/')) {
              callbacks?.onImage?.(url);
            }
          }
        };
        if (choice?.delta?.images && Array.isArray(choice.delta.images)) {
          emitImages(choice.delta.images);
        } else if (choice?.message?.images && Array.isArray(choice.message.images)) {
          emitImages(choice.message.images);
        }

        if (deltaReasoning) {
          reasoning += deltaReasoning;
          callbacks?.onReasoningToken?.(deltaReasoning);
        }
        if (deltaContent) {
          full += deltaContent;
          callbacks?.onToken?.(deltaContent);
        }
        if (json.usage) {
          usage = json.usage;
        }
      } catch (e) {
        // ignore malformed line
      }
    }
  }
  callbacks?.onDone?.(full, { usage, annotations });
}
