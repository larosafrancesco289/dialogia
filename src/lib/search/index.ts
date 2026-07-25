export { formatSourcesBlock } from '@/lib/search/ui/format';
export { getSearchToolDefinition } from '@/lib/search/tool/definition';
export { mergeSearchResults } from '@/lib/search/tool/results';
export { performWebFetchTool } from '@/lib/search/tool/fetchPage';
export { performWebSearchTool } from '@/lib/search/tool/webSearch';
export {
  extractWebSearchArgs,
  normalizeWebFetchArgs,
  parseWebSearchArgs,
  parseWebFetchArgs,
  normalizeWebSearchArgs,
} from '@/lib/search/args';
export type { SearchMode, SearchResult } from '@/lib/search/types';
export type { SearchProvider } from '@/lib/search/providers';
export {
  getSearchProvider,
  isSearchProviderReady,
  isNativeSearchMode,
  listSearchProviders,
  NATIVE_SEARCH_MODE,
  registerSearchProvider,
  searchProviderKeyRef,
} from '@/lib/search/providers';
