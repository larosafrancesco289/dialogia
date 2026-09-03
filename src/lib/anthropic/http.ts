import { sendApiRequest } from '@/lib/api/http';
import { apiDefaults } from '@/lib/api/config';
import type { TransportAuth } from '@/lib/auth/transport';
import { ANTHROPIC_API_VERSION } from '@/lib/anthropic/shared';

type AnthropicFetchOptions = {
  method?: string;
  auth?: TransportAuth;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  stream?: boolean;
  origin?: string;
  headers?: Record<string, string>;
};

async function anFetch(path: string, options: AnthropicFetchOptions = {}): Promise<Response> {
  if (!options.auth?.apiKey) throw new Error('missing_anthropic_api_key');
  const headers: Record<string, string> = {
    'anthropic-version': ANTHROPIC_API_VERSION,
    'x-api-key': options.auth.apiKey,
    // The page calls the Claude API directly; without this opt-in the API
    // refuses the browser's CORS preflight.
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(options.headers || {}),
  };

  const timeoutMs = options.timeoutMs ?? (options.stream ? undefined : apiDefaults.timeouts.chat);
  const baseUrl = options.auth.endpoint.baseUrl ?? 'https://api.anthropic.com/v1';

  return sendApiRequest({
    url: `${baseUrl}${path}`,
    method: options.method ?? 'GET',
    headers,
    body: options.body,
    signal: options.signal,
    timeoutMs,
    includeDefaults: false,
    origin: options.origin,
  });
}

export async function anFetchModels(
  auth: TransportAuth,
  options: { signal?: AbortSignal; origin?: string } = {},
): Promise<Response> {
  return anFetch('/models', {
    method: 'GET',
    auth,
    signal: options.signal,
    origin: options.origin,
    timeoutMs: apiDefaults.timeouts.models,
  });
}

export async function anMessages(options: {
  auth: TransportAuth;
  body: Record<string, unknown> | string;
  signal?: AbortSignal;
  stream?: boolean;
  origin?: string;
}): Promise<Response> {
  return anFetch('/messages', {
    method: 'POST',
    auth: options.auth,
    body: options.body,
    signal: options.signal,
    stream: options.stream,
    origin: options.origin,
    timeoutMs: options.stream ? undefined : apiDefaults.timeouts.chat,
  });
}
