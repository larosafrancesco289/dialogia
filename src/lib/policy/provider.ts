// Module: policy/provider
// Responsibility: Decide which search mode a turn actually uses, so compose/runtime/transport share
// one source of truth.

import type { ChatSettings, SearchMode } from '@/lib/types';
import { NATIVE_SEARCH_MODE } from '@/lib/types/enums';
import { getSearchProvider, isSearchProviderReady } from '@/lib/search/providers';

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
  return isSearchProviderReady(provider) ? provider.id : NATIVE_SEARCH_MODE;
}
