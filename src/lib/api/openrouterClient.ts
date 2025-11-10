import { apiDefaults } from '@/lib/api/config';
import { sendApiRequest } from '@/lib/api/http';
import { isOpenRouterProxyEnabled } from '@/lib/config';
import type { ModelContentBlock, ToolCall } from '@/lib/agent/types';

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ModelContentBlock[] | null;
  tool_calls?: ToolCall[];
  annotations?: unknown;
};

export type ChatCompletionChoice = {
  index: number;
  finish_reason?: string | null;
  message: ChatCompletionMessage;
};

export type ChatCompletionPayload = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: Usage;
};

export type SseDelta = {
  id?: string;
  object?: string;
  model?: string;
  created?: number;
  choices?: Array<{
    index?: number;
    finish_reason?: string | null;
    delta?: Partial<ChatCompletionMessage> & {
      reasoning?: string;
    };
  }>;
  usage?: Usage;
};

type OrFetchOptions = {
  method?: string;
  apiKey?: string;
  body?: any;
  signal?: AbortSignal;
  timeoutMs?: number;
  stream?: boolean;
  authRequired?: boolean;
  origin?: string;
  headers?: Record<string, string>;
};

async function orFetch(path: string, options: OrFetchOptions = {}): Promise<Response> {
  const useProxy = apiDefaults.isBrowser && isOpenRouterProxyEnabled();
  const authRequired = options.authRequired ?? !useProxy;
  const headers: Record<string, string> = { ...(options.headers || {}) };
  let includeDefaults = !useProxy;

  if (!useProxy) {
    if (authRequired) {
      if (!options.apiKey) throw new Error('missing_openrouter_api_key');
      headers.Authorization = `Bearer ${options.apiKey}`;
    } else if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }
    includeDefaults = true;
  }

  const timeoutMs =
    options.timeoutMs ?? (options.stream ? undefined : apiDefaults.timeouts.chat);

  const url = `${useProxy ? apiDefaults.proxyPath : apiDefaults.baseUrl}${path}`;

  return sendApiRequest({
    url,
    method: options.method ?? 'GET',
    headers,
    body: options.body,
    signal: options.signal,
    timeoutMs,
    includeDefaults,
    origin: options.origin,
  });
}

export async function orFetchModels(
  apiKey: string,
  options: { signal?: AbortSignal; origin?: string } = {},
): Promise<Response> {
  return orFetch('/models', {
    method: 'GET',
    apiKey,
    signal: options.signal,
    origin: options.origin,
    timeoutMs: apiDefaults.timeouts.models,
  });
}

export async function orFetchZdrEndpoints(
  options: { signal?: AbortSignal; origin?: string } = {},
): Promise<Response> {
  return orFetch('/endpoints/zdr', {
    method: 'GET',
    signal: options.signal,
    timeoutMs: apiDefaults.timeouts.zdr,
    authRequired: false,
    origin: options.origin,
  });
}

type ChatOptions = {
  apiKey: string;
  body: any;
  signal?: AbortSignal;
  stream?: boolean;
  origin?: string;
};

export async function orChatCompletions(options: ChatOptions): Promise<Response> {
  return orFetch('/chat/completions', {
    method: 'POST',
    apiKey: options.apiKey,
    body: options.body,
    signal: options.signal,
    stream: options.stream,
    origin: options.origin,
    timeoutMs: options.stream ? undefined : apiDefaults.timeouts.chat,
  });
}
