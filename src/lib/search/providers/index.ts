// Module: search/providers
// Responsibility: The entry point for the tool-based search registry. Importing
// this module registers the providers that ship with the app, so no call site
// can observe a half-empty registry regardless of import order. Read the
// registry through here, not through `registry.ts` directly.

import { registerSearchProvider } from '@/lib/search/providers/registry';
import { tavilySearchProvider } from '@/lib/search/providers/tavily';

export function registerBuiltInSearchProviders(): void {
  registerSearchProvider(tavilySearchProvider);
}

registerBuiltInSearchProviders();

export {
  buildSearchContext,
  getSearchProvider,
  isSearchProviderReady,
  listSearchProviders,
  registerSearchProvider,
  resetSearchProvidersForTest,
  searchProviderKeyRef,
} from '@/lib/search/providers/registry';
export { isNativeSearchMode, NATIVE_SEARCH_MODE } from '@/lib/search/providers/types';
export type {
  FetchOutcome,
  FetchedPage,
  NormalizedFetchArgs,
  NormalizedSearchArgs,
  SearchContext,
  SearchMode,
  SearchOutcome,
  SearchProvider,
} from '@/lib/search/providers/types';
export { TAVILY_PROVIDER_ID, tavilySearchProvider } from '@/lib/search/providers/tavily';
