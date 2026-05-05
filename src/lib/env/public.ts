import { readBooleanValue, readEnvValue } from '@/lib/env/values';
import { isProd } from '@/lib/env/runtime';
import type { ModelTransport } from '@/lib/types';

export function getPublicOpenRouterKey(): string | undefined {
  return readEnvValue(process.env.NEXT_PUBLIC_OPENROUTER_API_KEY);
}

export function getPublicAnthropicKey(): string | undefined {
  return readEnvValue(process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY);
}

export function isOpenRouterProxyEnabled(): boolean {
  return readBooleanValue(process.env.NEXT_PUBLIC_USE_OR_PROXY, false);
}

export function isAnthropicProxyEnabled(): boolean {
  return readBooleanValue(process.env.NEXT_PUBLIC_USE_ANTHROPIC_PROXY, false);
}

export function isTavilySearchConfigured(): boolean {
  return Boolean(
    readEnvValue(process.env.TAVILY_API_KEY) ||
      readEnvValue(process.env.NEXT_PUBLIC_TAVILY_API_KEY) ||
      readBooleanValue(process.env.NEXT_PUBLIC_TAVILY_SEARCH_ENABLED, false),
  );
}

export function getPublicAppBaseUrl(): string | undefined {
  return readEnvValue(process.env.NEXT_PUBLIC_APP_BASE_URL);
}

// ZDR toggle is opt-in; default documented in README to remain false when unset.
export function getDefaultZdrOnly(): boolean {
  return readBooleanValue(process.env.NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT, false);
}

export type RoutePreferenceDefault = 'balanced' | 'speed' | 'cost';

const ROUTE_PREFERENCE_VALUES: RoutePreferenceDefault[] = ['balanced', 'speed', 'cost'];

// Balanced leaves provider.sort unset so OpenRouter can use its price-weighted defaults.
export function getRoutePreferenceDefault(): RoutePreferenceDefault {
  const value = readEnvValue(process.env.NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT);
  if (value) {
    const normalized = value.toLowerCase() as RoutePreferenceDefault;
    if ((ROUTE_PREFERENCE_VALUES as string[]).includes(normalized)) {
      return normalized;
    }
  }
  return 'balanced';
}

export function getLogLevelSetting(): string | undefined {
  return readEnvValue(process.env.NEXT_PUBLIC_LOG_LEVEL || process.env.LOG_LEVEL);
}

export function getDefaultLogLevel(): string {
  return isProd() ? 'warn' : 'debug';
}

export function requireClientKeyOrProxy(transport: ModelTransport = 'openrouter'): {
  key?: string;
  useProxy: boolean;
} {
  const key = transport === 'anthropic' ? getPublicAnthropicKey() : getPublicOpenRouterKey();
  const useProxy =
    transport === 'anthropic' ? isAnthropicProxyEnabled() : isOpenRouterProxyEnabled();
  if (!key && !useProxy) {
    const error = new Error('missing_client_key_or_proxy');
    (error as { code?: string }).code = 'missing_client_key_or_proxy';
    (error as { transport?: ModelTransport }).transport = transport;
    throw error;
  }
  return { key, useProxy };
}
