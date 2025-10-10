// Module: api/config
// Responsibility: Provide shared transport configuration defaults for OpenRouter requests.

const BROWSER =
  typeof window !== 'undefined' && typeof window.document !== 'undefined' && window.document !== null;

const DEFAULT_ORIGIN = 'http://localhost:3000';

function readEnvOrigin(): string | undefined {
  const envValue =
    (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_APP_BASE_URL) || '';
  const trimmed = envValue?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, '');
  return undefined;
}

function resolveOrigin(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim();
  const envOrigin = readEnvOrigin();
  if (envOrigin) return envOrigin;
  if (BROWSER && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_ORIGIN;
}

function buildHeaders(origin: string): Record<string, string> {
  return {
    'X-Title': 'Dialogia',
    'HTTP-Referer': origin,
  };
}

export const apiDefaults = Object.freeze({
  baseUrl: 'https://openrouter.ai/api/v1',
  proxyPath: '/api/openrouter',
  isBrowser: BROWSER,
  resolveOrigin,
  headers: buildHeaders,
  timeouts: Object.freeze({
    models: 20_000,
    zdr: 20_000,
    chat: 45_000,
  }),
});

export type ApiTimeoutKey = keyof typeof apiDefaults.timeouts;
