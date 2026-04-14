import { sendApiRequest } from '@/lib/api/http';
import { apiDefaults } from '@/lib/api/config';
import { isAnthropicProxyEnabled } from '@/lib/env/public';
import type { TransportAuth } from '@/lib/auth/transport';
import { ANTHROPIC_API_VERSION } from '@/lib/anthropic/shared';

type AnthropicFetchOptions = {
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

async function anFetch(path: string, options: AnthropicFetchOptions = {}): Promise<Response> {
  const useProxy =
    typeof options.auth?.useProxy === 'boolean'
      ? options.auth.useProxy
      : apiDefaults.isBrowser && isAnthropicProxyEnabled();
  const authRequired = options.authRequired ?? !useProxy;
  const headers: Record<string, string> = {
    'anthropic-version': ANTHROPIC_API_VERSION,
    ...(options.headers || {}),
  };

  if (!useProxy) {
    if (authRequired) {
      if (!options.auth?.apiKey) throw new Error('missing_anthropic_api_key');
      headers['x-api-key'] = options.auth.apiKey;
    } else if (options.auth?.apiKey) {
      headers['x-api-key'] = options.auth.apiKey;
    }
  }

  const timeoutMs = options.timeoutMs ?? (options.stream ? undefined : apiDefaults.timeouts.chat);
  const url = `${useProxy ? '/api/anthropic' : 'https://api.anthropic.com/v1'}${path}`;

  return sendApiRequest({
    url,
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
