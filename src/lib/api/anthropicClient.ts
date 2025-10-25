import { apiDefaults } from '@/lib/api/config';
import { isAnthropicProxyEnabled } from '@/lib/config';

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

function toBodyInit(body: any): BodyInit | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof ReadableStream) return body as unknown as BodyInit;
  return JSON.stringify(body);
}

async function anthropicFetch(path: string, options: AnthropicFetchOptions = {}): Promise<Response> {
  const useProxy = anthropicDefaults.isBrowser && isAnthropicProxyEnabled();
  const headers: Record<string, string> = {
    'anthropic-version': anthropicDefaults.version,
    ...(options.headers || {}),
  };
  const origin = apiDefaults.resolveOrigin(options.origin);
  const body = toBodyInit(options.body);
  if (body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  if (!useProxy) {
    if (!options.apiKey) throw new Error('missing_anthropic_api_key');
    headers['x-api-key'] = options.apiKey;
    Object.assign(headers, apiDefaults.headers(origin));
  } else if (options.apiKey) {
    // When proxying with a client-provided key (rare), still forward for parity.
    headers['x-api-key'] = options.apiKey;
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? (options.stream ? undefined : anthropicDefaults.timeouts.chat);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs && timeoutMs > 0) timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      const onAbort = () => controller.abort(options.signal?.reason);
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const base = useProxy ? anthropicDefaults.proxyPath : anthropicDefaults.baseUrl;
    const url = `${base}${path}`;
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
      cache: 'no-store',
    });
    return response;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function anthropicFetchModels(
  apiKey: string | undefined,
  options: { signal?: AbortSignal; origin?: string } = {},
): Promise<Response> {
  const useProxy = anthropicDefaults.isBrowser && isAnthropicProxyEnabled();
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
  const useProxy = anthropicDefaults.isBrowser && isAnthropicProxyEnabled();
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
