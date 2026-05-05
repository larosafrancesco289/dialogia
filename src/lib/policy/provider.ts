// Module: policy/provider
// Responsibility: Centralize provider routing policy (route preference → provider sort, search provider selection)
// so compose/runtime/transport share one source of truth.

import type { ChatSettings, SearchProvider } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import { ProviderSort } from '@/lib/models/providerSort';
import { isTavilySearchConfigured } from '@/lib/env/public';

export function providerSortFromRoutePref(
  pref?: UiSnapshot['routePreference'] | null,
): ProviderSort | undefined {
  if (pref === 'cost') return ProviderSort.Price;
  if (pref === 'speed') return ProviderSort.Throughput;
  return undefined;
}

export function selectSearchProvider(settings: ChatSettings, _ui: UiSnapshot): SearchProvider {
  const configuredProvider =
    (settings.features.search.provider as SearchProvider | undefined) ||
    (isTavilySearchConfigured() ? ('tavily' as const) : ('openrouter' as const));
  if (configuredProvider === 'tavily') return 'tavily';
  return 'openrouter';
}

export function buildProviderPolicy(opts: { settings: ChatSettings; ui: UiSnapshot }): {
  providerSort?: ProviderSort;
  searchEnabled: boolean;
  searchProvider: SearchProvider;
} {
  const searchEnabled = !!opts.settings.features.search.enabled;
  const searchProvider = selectSearchProvider(opts.settings, opts.ui);
  return {
    providerSort: providerSortFromRoutePref(opts.ui.routePreference),
    searchEnabled,
    searchProvider,
  };
}
