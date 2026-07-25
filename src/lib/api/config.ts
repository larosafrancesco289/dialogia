// Module: api/config
// Responsibility: Provide shared transport configuration defaults for OpenRouter requests.

import { getPublicAppBaseUrl } from '@/lib/env/public';

/**
 * Evaluated per call rather than captured at import: the same modules run in the
 * page and inside the Cloudflare worker, and only the page can resolve a
 * relative proxy path.
 */
export function isBrowserContext(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.document !== 'undefined' &&
    window.document !== null
  );
}

const DEFAULT_ORIGIN = 'http://localhost:3000';

function readEnvOrigin(): string | undefined {
  const envValue = getPublicAppBaseUrl();
  if (envValue) return envValue.replace(/\/+$/, '');
  return undefined;
}

function resolveOrigin(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim();
  const envOrigin = readEnvOrigin();
  if (envOrigin) return envOrigin;
  if (isBrowserContext() && window.location?.origin) {
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
  resolveOrigin,
  headers: buildHeaders,
  timeouts: Object.freeze({
    models: 20_000,
    zdr: 20_000,
    chat: 45_000,
  }),
});

export type ApiTimeoutKey = keyof typeof apiDefaults.timeouts;
