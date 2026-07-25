// Module: search/providers/registry
// Responsibility: Which tool-based search providers exist and which can run now.

import { getKey } from '@/lib/keys/store';
import type { SearchContext, SearchMode, SearchProvider } from '@/lib/search/providers/types';
import { isNativeSearchMode } from '@/lib/search/providers/types';

const providers = new Map<string, SearchProvider>();

export function registerSearchProvider(provider: SearchProvider): void {
  providers.set(provider.id, provider);
}

export function getSearchProvider(id?: SearchMode): SearchProvider | undefined {
  if (!id || isNativeSearchMode(id)) return undefined;
  return providers.get(id);
}

export function listSearchProviders(): SearchProvider[] {
  return Array.from(providers.values());
}

export function searchProviderKeyRef(provider: SearchProvider): string {
  return provider.keyRef ?? provider.id;
}

/** Usable right now: no key needed, a key is stored, or the deployment proxies it. */
export function isSearchProviderReady(provider: SearchProvider, useProxy = false): boolean {
  if (!provider.requiresKey) return true;
  if (useProxy) return true;
  return typeof getKey(searchProviderKeyRef(provider)) === 'string';
}

export function buildSearchContext(
  provider: SearchProvider,
  opts: { useProxy?: boolean; signal?: AbortSignal } = {},
): SearchContext {
  return {
    apiKey: getKey(searchProviderKeyRef(provider)),
    useProxy: opts.useProxy,
    signal: opts.signal,
  };
}

export function resetSearchProvidersForTest(): void {
  providers.clear();
}
