// Module: policy/provider
// Responsibility: Centralize provider routing policy (route preference → provider sort, search provider selection)
// so compose/runtime/transport share one source of truth.

import type { SearchProvider } from '@/lib/agent/types';
import type { ChatSettings } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import { ProviderSort } from '@/lib/models/providerSort';

export function providerSortFromRoutePref(
  pref?: UIState['routePreference'] | null,
): ProviderSort | undefined {
  if (pref === 'cost') return ProviderSort.Price;
  if (pref === 'speed') return ProviderSort.Throughput;
  return undefined;
}

export function selectSearchProvider(settings: ChatSettings, ui: UIState): SearchProvider {
  const configuredProvider =
    (settings.search_provider as SearchProvider | undefined) || ('openrouter' as const);
  if (ui.flags.experimentalBrave && configuredProvider === 'brave') return 'brave';
  return 'openrouter';
}

export function buildProviderPolicy(opts: { settings: ChatSettings; ui: UIState }): {
  providerSort?: ProviderSort;
  searchEnabled: boolean;
  searchProvider: SearchProvider;
} {
  const searchEnabled = !!opts.settings.search_enabled;
  const searchProvider = selectSearchProvider(opts.settings, opts.ui);
  return {
    providerSort: providerSortFromRoutePref(opts.ui.routePreference),
    searchEnabled,
    searchProvider,
  };
}
