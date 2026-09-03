import { apiDefaults } from '@/lib/api/config';
import { sendApiRequest } from '@/lib/api/http';
import type { TransportAuth } from '@/lib/auth/transport';
import type { ChatCompletionMessage, Usage } from '@/lib/transport/completions';
import { getDefaultEndpoint } from '@/lib/transport/endpointRegistry';
import { normalizeBaseUrl } from '@/lib/transport/endpoints';
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

/**
 * Where the call goes and which courtesy headers it carries. OpenRouter wants
 * `X-Title`/`HTTP-Referer`; a user-configured OpenAI-compatible server has no
 * idea what those are, so it gets neither.
 */
function resolveTarget(auth?: TransportAuth): { baseUrl: string; includeDefaults: boolean } {
  const endpoint = auth?.endpoint ?? getDefaultEndpoint();
  if (endpoint.kind === 'openai-compatible') {
    return { baseUrl: normalizeBaseUrl(endpoint.baseUrl ?? ''), includeDefaults: false };
  }
  return { baseUrl: endpoint.baseUrl ?? apiDefaults.baseUrl, includeDefaults: true };
}

async function orFetch(path: string, options: OrFetchOptions = {}): Promise<Response> {
  const target = resolveTarget(options.auth);
  // Local OpenAI-compatible servers commonly need no key at all.
  const keyOptional = options.auth?.endpoint.kind === 'openai-compatible';
  const authRequired = options.authRequired ?? !keyOptional;
  const headers: Record<string, string> = { ...(options.headers || {}) };

  if (authRequired && !options.auth?.apiKey) throw new Error('missing_openrouter_api_key');
  if (options.auth?.apiKey) headers.Authorization = `Bearer ${options.auth.apiKey}`;

  const timeoutMs = options.timeoutMs ?? (options.stream ? undefined : apiDefaults.timeouts.chat);

  return sendApiRequest({
    url: `${target.baseUrl}${path}`,
    method: options.method ?? 'GET',
    headers,
    body: options.body,
    signal: options.signal,
    timeoutMs,
    includeDefaults: target.includeDefaults,
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

/** Unauthenticated: the ZDR list is public and always comes from OpenRouter itself. */
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
