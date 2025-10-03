import { isOpenRouterProxyEnabled } from '@/lib/config';

const OR_BASE_URL = 'https://openrouter.ai/api/v1';
const PROXY_BASE_PATH = '/api/openrouter';
const IS_BROWSER = typeof window !== 'undefined';

function resolveOrigin(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit;
  if (IS_BROWSER && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

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

function toBodyInit(body: any): BodyInit | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof ReadableStream) return body as unknown as BodyInit;
  return JSON.stringify(body);
}

async function orFetch(path: string, options: OrFetchOptions = {}): Promise<Response> {
  const useProxy = IS_BROWSER && isOpenRouterProxyEnabled();
  const authRequired = options.authRequired ?? !useProxy;
  const headers: Record<string, string> = { ...(options.headers || {}) };
  const body = toBodyInit(options.body);
  if (body != null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const origin = resolveOrigin(options.origin);
  if (!useProxy) {
    if (authRequired) {
      if (!options.apiKey) throw new Error('missing_openrouter_api_key');
      headers.Authorization = `Bearer ${options.apiKey}`;
    } else if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }
    headers['X-Title'] = 'Dialogia';
    headers['HTTP-Referer'] = origin;
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? (options.stream ? undefined : 20000);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs && timeoutMs > 0) {
    timeout = setTimeout(() => controller.abort(), timeoutMs);
  }
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      const onAbort = () => controller.abort(options.signal?.reason);
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const url = `${useProxy ? PROXY_BASE_PATH : OR_BASE_URL}${path}`;
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

export async function orFetchModels(
  apiKey: string,
  options: { signal?: AbortSignal; origin?: string } = {},
): Promise<Response> {
  return orFetch('/models', {
    method: 'GET',
    apiKey,
    signal: options.signal,
    origin: options.origin,
    timeoutMs: 20000,
  });
}

export async function orFetchZdrEndpoints(
  options: { signal?: AbortSignal; origin?: string } = {},
): Promise<Response> {
  return orFetch('/endpoints/zdr', {
    method: 'GET',
    signal: options.signal,
    timeoutMs: 20000,
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
    timeoutMs: options.stream ? undefined : 45000,
  });
}
