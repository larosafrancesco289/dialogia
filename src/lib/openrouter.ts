import type { ORModel } from '@/lib/types';
const USE_PROXY = process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';

const OR_BASE = 'https://openrouter.ai/api/v1' as const;

// Fetch provider identifiers for endpoints that are Zero Data Retention (ZDR)
// Returns a set of provider prefixes (e.g., 'moonshotai') to match against model ids
export async function fetchZdrProviderIds(): Promise<Set<string>> {
  const url = USE_PROXY
    ? '/api/openrouter/endpoints/zdr'
    : 'https://openrouter.ai/api/v1/endpoints/zdr';
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store' as any,
    });
    if (!res.ok) throw new Error(`zdr_failed_${res.status}`);
    const data = await res.json();
    const items: any[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : Array.isArray(data?.endpoints)
          ? data.endpoints
          : [];
    const providers = new Set<string>();
    for (const ep of items) {
      const tryAdd = (val: unknown) => {
        if (typeof val === 'string' && val.trim()) providers.add(val.trim());
      };
      // Prefer explicit provider identifiers if present
      tryAdd((ep && (ep.provider || ep.provider_id || ep.slug || ep.id)) as any);
      // If models list is present, derive prefixes from model ids
      const models: any[] = Array.isArray(ep?.models) ? ep.models : [];
      for (const m of models) {
        const id: string | undefined = typeof m === 'string' ? m : m?.id;
        if (id && id.includes('/')) tryAdd(id.split('/')[0]);
      }
      // If id looks like 'provider/model', derive provider
      const eid: string | undefined = ep?.id;
      if (eid && eid.includes('/')) tryAdd(eid.split('/')[0]);
      // Normalize some known host->provider mappings if a URL is present
      const urlStr: string | undefined = ep?.url || ep?.endpoint || ep?.base_url;
      if (typeof urlStr === 'string') {
        const u = urlStr.toLowerCase();
        if (u.includes('moonshot')) providers.add('moonshotai');
        if (u.includes('mistral')) providers.add('mistralai');
        if (u.includes('perplexity')) providers.add('perplexity');
        if (u.includes('openai')) providers.add('openai');
      }
    }
    return providers;
  } catch (_e) {
    // No fallback providers in strict mode
    return new Set();
  }
}

// Fetch a set of model ids that are explicitly ZDR-enabled, when provided by the endpoint
export async function fetchZdrModelIds(): Promise<Set<string>> {
  const url = USE_PROXY
    ? '/api/openrouter/endpoints/zdr'
    : 'https://openrouter.ai/api/v1/endpoints/zdr';
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store' as any,
    });
    if (!res.ok) throw new Error(`zdr_failed_${res.status}`);
    const data = await res.json();
    const items: any[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : Array.isArray(data?.endpoints)
          ? data.endpoints
          : [];
    const modelIds = new Set<string>();
    for (const ep of items) {
      // Preferred: parse from `name` pattern "Provider | provider/model"
      if (typeof ep?.name === 'string' && ep.name.includes('|')) {
        const rhs = ep.name.split('|')[1]?.trim();
        if (rhs && rhs.includes('/')) modelIds.add(rhs);
      }
      // Fallbacks: some entries may include explicit models arrays
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
  const url = USE_PROXY ? '/api/openrouter/models' : `${OR_BASE}/models`;
  const headers: Record<string, string> = USE_PROXY
    ? { 'Content-Type': 'application/json' }
    : {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Dialogia',
      };
  // Add a conservative timeout to avoid hung UI if the network stalls
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(url, { headers, cache: 'no-store' as any, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    throw new Error(`models_failed_${res.status}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.data) ? data.data : data;
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
  onDone?: (full: string, extras?: { usage?: any }) => void;
  onError?: (err: Error) => void;
};

// OpenAI-compatible non-streaming chat completion with optional tool support
export async function chatCompletion(params: {
  apiKey: string;
  model: string;
  // Loosen type to allow multimodal content arrays and tool roles
  messages: any[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  tools?: any[];
  tool_choice?: 'auto' | { type: 'function'; function: { name: string } };
  signal?: AbortSignal;
  providerSort?: 'price' | 'throughput';
  plugins?: any[];
}) {
  const {
    apiKey,
    model,
    messages,
    temperature,
    top_p,
    max_tokens,
    reasoning_effort,
    reasoning_tokens,
    tools,
    tool_choice,
    signal,
    providerSort,
  } = params;

  const body: any = { model, messages, stream: false };
  if (typeof temperature === 'number') body.temperature = temperature;
  if (typeof top_p === 'number') body.top_p = top_p;
  if (typeof max_tokens === 'number') body.max_tokens = max_tokens;
  const reasoningConfig: any = {};
  if (typeof reasoning_effort === 'string') reasoningConfig.effort = reasoning_effort;
  if (typeof reasoning_tokens === 'number') reasoningConfig.max_tokens = reasoning_tokens;
  if (Object.keys(reasoningConfig).length > 0) body.reasoning = reasoningConfig;
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
  if (providerSort === 'price' || providerSort === 'throughput') {
    body.provider = { ...(body.provider || {}), sort: providerSort };
  }
  if (Array.isArray(params.plugins) && params.plugins.length > 0) {
    body.plugins = params.plugins;
  }

  const url = USE_PROXY ? '/api/openrouter/chat/completions' : `${OR_BASE}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(USE_PROXY
        ? { 'Content-Type': 'application/json' }
        : {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'Dialogia',
          }),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401 || res.status === 403) throw new Error('unauthorized');
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok) throw new Error(`chat_failed_${res.status}`);
  const json = await res.json();
  return json;
}

export async function streamChatCompletion(params: {
  apiKey: string;
  model: string;
  // Allow multimodal content arrays
  messages: any[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  // Reasoning configuration (optional)
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  // Tool calling (optional)
  tools?: any[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  signal?: AbortSignal;
  callbacks?: StreamCallbacks;
  providerSort?: 'price' | 'throughput';
  plugins?: any[];
}) {
  const {
    apiKey,
    model,
    messages,
    temperature,
    top_p,
    max_tokens,
    reasoning_effort,
    reasoning_tokens,
    signal,
    callbacks,
    providerSort,
  } = params;

  // Build body with only provided optional fields so OpenRouter can apply model defaults
  const body: any = { model, messages, stream: true, stream_options: { include_usage: true } };
  if (typeof temperature === 'number') body.temperature = temperature;
  if (typeof top_p === 'number') body.top_p = top_p;
  if (typeof max_tokens === 'number') body.max_tokens = max_tokens;
  // Include reasoning block whenever the user provided effort (including 'none')
  // or a reasoning token budget, so models don't silently fall back to defaults.
  const reasoningConfig: any = {};
  if (typeof reasoning_effort === 'string') reasoningConfig.effort = reasoning_effort;
  if (typeof reasoning_tokens === 'number') reasoningConfig.max_tokens = reasoning_tokens;
  if (Object.keys(reasoningConfig).length > 0) body.reasoning = reasoningConfig;
  // Tools (optional). Always include when provided so the router can validate schemas.
  if (Array.isArray(params.tools) && params.tools.length > 0) body.tools = params.tools;
  if (params.tool_choice) body.tool_choice = params.tool_choice as any;
  if (providerSort === 'price' || providerSort === 'throughput') {
    body.provider = { ...(body.provider || {}), sort: providerSort };
  }
  if (Array.isArray(params.plugins) && params.plugins.length > 0) {
    body.plugins = params.plugins;
  }

  const url2 = USE_PROXY ? '/api/openrouter/chat/completions' : `${OR_BASE}/chat/completions`;
  const res = await fetch(url2, {
    method: 'POST',
    headers: {
      ...(USE_PROXY
        ? { 'Content-Type': 'application/json' }
        : {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'Dialogia',
          }),
    },
    body: JSON.stringify(body),
    signal,
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
  callbacks?.onDone?.(full, { usage });
}
