import type { ORModel } from '@/lib/types';

const OR_BASE = 'https://openrouter.ai/api/v1' as const;

export async function fetchModels(apiKey: string): Promise<ORModel[]> {
  const res = await fetch(`${OR_BASE}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Dialogia',
    },
  });
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
  // Allow tool-bearing roles by loosening the type here
  messages: Array<
    | { role: 'system' | 'user' | 'assistant'; content: string | null }
    | { role: 'tool'; content: string; tool_call_id?: string; name?: string }
  >;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  tools?: any[];
  tool_choice?: 'auto' | { type: 'function'; function: { name: string } };
  signal?: AbortSignal;
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

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Dialogia',
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
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  // Reasoning configuration (optional)
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  signal?: AbortSignal;
  callbacks?: StreamCallbacks;
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

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Dialogia',
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
