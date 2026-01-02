import { apiDefaults } from '@/lib/api/config';
import { sendApiRequest } from '@/lib/api/http';
import { isOpenRouterProxyEnabled } from '@/lib/env/public';
import type { TransportAuth } from '@/lib/auth/transport';
import type { ChatCompletionMessage, Usage } from '@/lib/transport/completions';
import type { OpenRouterChatRequest } from '@/lib/openrouter/types';

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
  auth?: TransportAuth;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  stream?: boolean;
  authRequired?: boolean;
  origin?: string;
  headers?: Record<string, string>;
};

async function orFetch(path: string, options: OrFetchOptions = {}): Promise<Response> {
  const useProxy =
    typeof options.auth?.useProxy === 'boolean'
      ? options.auth.useProxy
      : apiDefaults.isBrowser && isOpenRouterProxyEnabled();
  const authRequired = options.authRequired ?? !useProxy;
  const headers: Record<string, string> = { ...(options.headers || {}) };
  let includeDefaults = !useProxy;

  if (!useProxy) {
    if (authRequired) {
      if (!options.auth?.apiKey) throw new Error('missing_openrouter_api_key');
      headers.Authorization = `Bearer ${options.auth.apiKey}`;
    } else if (options.auth?.apiKey) {
      headers.Authorization = `Bearer ${options.auth.apiKey}`;
    }
    includeDefaults = true;
  }

  const timeoutMs = options.timeoutMs ?? (options.stream ? undefined : apiDefaults.timeouts.chat);

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
  auth: TransportAuth,
  options: { signal?: AbortSignal; origin?: string } = {},
): Promise<Response> {
  return orFetch('/models', {
    method: 'GET',
    auth,
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
  auth: TransportAuth;
  body: OpenRouterChatRequest | string;
  signal?: AbortSignal;
  stream?: boolean;
  origin?: string;
};

export async function orChatCompletions(options: ChatOptions): Promise<Response> {
  return orFetch('/chat/completions', {
    method: 'POST',
    auth: options.auth,
    body: options.body,
    signal: options.signal,
    stream: options.stream,
    origin: options.origin,
    timeoutMs: options.stream ? undefined : apiDefaults.timeouts.chat,
  });
}
