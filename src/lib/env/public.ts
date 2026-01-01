import { readBooleanValue, readEnvValue } from '@/lib/env/values';
import { isProd } from '@/lib/env/runtime';

export function getPublicOpenRouterKey(): string | undefined {
  return readEnvValue(process.env.NEXT_PUBLIC_OPENROUTER_API_KEY);
}

export function isOpenRouterProxyEnabled(): boolean {
  return readBooleanValue(process.env.NEXT_PUBLIC_USE_OR_PROXY, false);
}

export function getPublicAppBaseUrl(): string | undefined {
  return readEnvValue(process.env.NEXT_PUBLIC_APP_BASE_URL);
}

// ZDR toggle is opt-in; default documented in README to remain false when unset.
export function getDefaultZdrOnly(): boolean {
  return readBooleanValue(process.env.NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT, false);
}

export type RoutePreferenceDefault = 'speed' | 'cost';

const ROUTE_PREFERENCE_VALUES: RoutePreferenceDefault[] = ['speed', 'cost'];

// UI defaults map directly to transport mapping in agent/request.providerSortFromRoutePref.
export function getRoutePreferenceDefault(): RoutePreferenceDefault {
  const value = readEnvValue(process.env.NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT);
  if (value) {
    const normalized = value.toLowerCase() as RoutePreferenceDefault;
    if ((ROUTE_PREFERENCE_VALUES as string[]).includes(normalized)) {
      return normalized;
    }
  }
  return 'speed';
}

export function getLogLevelSetting(): string | undefined {
  return readEnvValue(process.env.NEXT_PUBLIC_LOG_LEVEL || process.env.LOG_LEVEL);
}

export function getDefaultLogLevel(): string {
  return isProd() ? 'warn' : 'debug';
}

export function requireClientKeyOrProxy(): { key?: string; useProxy: boolean } {
  const key = getPublicOpenRouterKey();
  const useProxy = isOpenRouterProxyEnabled();
  if (!key && !useProxy) {
    const error = new Error('missing_client_key_or_proxy');
    (error as { code?: string }).code = 'missing_client_key_or_proxy';
    throw error;
  }
  return { key, useProxy };
}
