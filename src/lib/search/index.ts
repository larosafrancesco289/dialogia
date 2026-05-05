export { formatSourcesBlock } from '@/lib/search/ui/format';
export { getSearchToolDefinition } from '@/lib/search/tool/definition';
export { mergeSearchResults } from '@/lib/search/tool/results';
export { runTavilySearch } from '@/lib/search/tool/runTavilySearch';
export { performWebSearchTool } from '@/lib/search/tool/webSearch';
export {
  extractWebSearchArgs,
  parseWebSearchArgs,
  normalizeWebSearchArgs,
} from '@/lib/search/args';
export type { SearchProvider, SearchResult } from '@/lib/search/types';
