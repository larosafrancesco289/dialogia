const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function readEnvValue(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readEnv(name: string): string | undefined {
  return readEnvValue(process.env[name]);
}

function readBooleanValue(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = readEnvValue(value);
  if (!normalized) return defaultValue;
  return TRUE_VALUES.has(normalized.toLowerCase());
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  return readBooleanValue(process.env[name], defaultValue);
}

export function getPublicOpenRouterKey(): string | undefined {
  return readEnvValue(process.env.NEXT_PUBLIC_OPENROUTER_API_KEY);
}

export function isOpenRouterProxyEnabled(): boolean {
  return readBooleanValue(process.env.NEXT_PUBLIC_USE_OR_PROXY, false);
}

export function hasBraveKey(): boolean {
  return Boolean(readEnv('BRAVE_SEARCH_API_KEY'));
}

export function getBraveSearchKey(): string | undefined {
  return readEnv('BRAVE_SEARCH_API_KEY');
}

export function getServerOpenRouterKey(): string | undefined {
  return readEnv('OPENROUTER_API_KEY');
}

export function requireServerOpenRouterKey(): string {
  const key = getServerOpenRouterKey();
  if (!key) throw new Error('Missing env: OPENROUTER_API_KEY');
  return key;
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

export function getDeepResearchReasoningOnly(): boolean {
  return readBooleanEnv('DEEP_RESEARCH_REASONING_ONLY', true);
}

export function getAccessCookieDomain(): string | undefined {
  return readEnv('ACCESS_COOKIE_DOMAIN');
}

export function requireClientKeyOrProxy(): { key?: string; useProxy: boolean } {
  const key = getPublicOpenRouterKey();
  const useProxy = isOpenRouterProxyEnabled();
  if (!key && !useProxy) {
    const error = new Error('missing_client_key_or_proxy');
    (error as any).code = 'missing_client_key_or_proxy';
    throw error;
  }
  return { key, useProxy };
}

export function isProd(): boolean {
  return readEnvValue(process.env.NODE_ENV)?.toLowerCase() === 'production';
}

export function isDev(): boolean {
  return !isProd();
}
