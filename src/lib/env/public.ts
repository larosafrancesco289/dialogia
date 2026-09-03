import { readClientEnv } from '@/lib/env/importMeta';
import { readBooleanValue, readEnvValue } from '@/lib/env/values';
import { isProd } from '@/lib/env/runtime';

// There is deliberately no client-side provider key variable. Every key comes
// from the key store the user fills in, and the bundle carries no secrets.

export function getPublicAppBaseUrl(): string | undefined {
  return readEnvValue(readClientEnv('VITE_APP_BASE_URL'));
}

// ZDR toggle is opt-in; default documented in README to remain false when unset.
export function getDefaultZdrOnly(): boolean {
  return readBooleanValue(readClientEnv('VITE_OR_ZDR_ONLY_DEFAULT'), false);
}

export type RoutePreferenceDefault = 'balanced' | 'speed' | 'cost';

const ROUTE_PREFERENCE_VALUES: RoutePreferenceDefault[] = ['balanced', 'speed', 'cost'];

// Balanced leaves provider.sort unset so OpenRouter can use its price-weighted defaults.
export function getRoutePreferenceDefault(): RoutePreferenceDefault {
  const value = readEnvValue(readClientEnv('VITE_OR_ROUTE_PREFERENCE_DEFAULT'));
  if (value) {
    const normalized = value.toLowerCase() as RoutePreferenceDefault;
    if ((ROUTE_PREFERENCE_VALUES as string[]).includes(normalized)) {
      return normalized;
    }
  }
  return 'balanced';
}

export function getLogLevelSetting(): string | undefined {
  return readEnvValue(readClientEnv('VITE_LOG_LEVEL'));
}

export function getDefaultLogLevel(): string {
  return isProd() ? 'warn' : 'debug';
}
