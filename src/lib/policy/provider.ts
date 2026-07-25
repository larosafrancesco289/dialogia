// Module: policy/provider
// Responsibility: Centralize provider routing policy (route preference → provider sort, search mode
// selection) so compose/runtime/transport share one source of truth.

import type { ChatSettings, SearchMode } from '@/lib/types';
import { NATIVE_SEARCH_MODE } from '@/lib/types/enums';
import { ProviderSort } from '@/lib/models/providerSort';
import { getSearchProvider, isSearchProviderReady } from '@/lib/search/providers';
import { isTavilyProxyEnabled } from '@/lib/env/public';

export function providerSortFromRoutePref(
  pref?: 'balanced' | 'speed' | 'cost' | null,
): ProviderSort | undefined {
  if (pref === 'cost') return ProviderSort.Price;
  if (pref === 'speed') return ProviderSort.Throughput;
  return undefined;
}

/**
 * Provider-native search always works with just a model key, so it is the
 * fallback whenever the configured tool-based provider is unknown or has no key
 * — a chat configured for Tavily on another machine degrades to native search
 * rather than failing.
 */
export function selectSearchMode(settings: ChatSettings, _ui?: unknown): SearchMode {
  const configured = settings.features.search.provider;
  if (!configured || configured === NATIVE_SEARCH_MODE) return NATIVE_SEARCH_MODE;
  const provider = getSearchProvider(configured);
  if (!provider) return NATIVE_SEARCH_MODE;
  return isSearchProviderReady(provider, isTavilyProxyEnabled()) ? provider.id : NATIVE_SEARCH_MODE;
}

export function buildProviderPolicy(opts: { settings: ChatSettings; ui?: unknown }): {
  providerSort?: ProviderSort;
  searchEnabled: boolean;
  searchProvider: SearchMode;
} {
  const searchEnabled = !!opts.settings.features.search.enabled;
  const searchProvider = selectSearchMode(opts.settings, opts.ui);
  return {
    providerSort: providerSortFromRoutePref('balanced'),
    searchEnabled,
    searchProvider,
  };
}
