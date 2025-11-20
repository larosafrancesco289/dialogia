import { isAnthropicProxyEnabled } from '@/lib/config';
import { sendApiRequest } from '@/lib/api/http';

const BROWSER =
  typeof window !== 'undefined' && typeof window.document !== 'undefined' && window.document !== null;

const DEFAULT_VERSION = '2023-06-01';

const anthropicDefaults = Object.freeze({
  baseUrl: 'https://api.anthropic.com/v1',
  proxyPath: '/api/anthropic',
  isBrowser: BROWSER,
  version: DEFAULT_VERSION,
  timeouts: Object.freeze({
    models: 15_000,
    chat: 45_000,
  }),
});

type AnthropicFetchOptions = {
  method?: string;
  apiKey?: string;
  body?: any;
  signal?: AbortSignal;
  stream?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
  origin?: string;
};

async function anthropicFetch(path: string, options: AnthropicFetchOptions = {}): Promise<Response> {
  const useProxy = anthropicDefaults.isBrowser && isAnthropicProxyEnabled();
  const headers: Record<string, string> = {
    'anthropic-version': anthropicDefaults.version,
    ...(options.headers || {}),
  };
  let includeDefaults = !useProxy;

  if (!useProxy) {
    if (!options.apiKey) throw new Error('missing_anthropic_api_key');
    headers['x-api-key'] = options.apiKey;
    includeDefaults = true;
  } else if (options.apiKey) {
    // When proxying with a client-provided key (rare), still forward for parity.
    headers['x-api-key'] = options.apiKey;
  }

  const timeoutMs = options.timeoutMs ?? (options.stream ? undefined : anthropicDefaults.timeouts.chat);

  const base = useProxy ? anthropicDefaults.proxyPath : anthropicDefaults.baseUrl;
  const url = `${base}${path}`;
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

export async function anthropicFetchModels(
  apiKey: string | undefined,
  options: { signal?: AbortSignal; origin?: string } = {},
): Promise<Response> {
  const normalizedKey = typeof apiKey === 'string' && apiKey.trim().length > 0 ? apiKey.trim() : undefined;
  return anthropicFetch('/models', {
    method: 'GET',
    apiKey: normalizedKey,
    signal: options.signal,
    origin: options.origin,
    timeoutMs: anthropicDefaults.timeouts.models,
  });
}

type AnthropicChatOptions = {
  apiKey?: string;
  body: any;
  signal?: AbortSignal;
  stream?: boolean;
  origin?: string;
};

export async function anthropicMessages(options: AnthropicChatOptions): Promise<Response> {
  const normalizedKey =
    typeof options.apiKey === 'string' && options.apiKey.trim().length > 0
      ? options.apiKey.trim()
      : undefined;
  return anthropicFetch('/messages', {
    method: 'POST',
    apiKey: normalizedKey,
    body: options.body,
    signal: options.signal,
    stream: options.stream,
    origin: options.origin,
    timeoutMs: options.stream ? undefined : anthropicDefaults.timeouts.chat,
  });
}

export { anthropicDefaults };
