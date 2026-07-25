import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
import { getSearchProvider } from '@/lib/search/providers';
import type { SearchMode, SearchResult } from '@/lib/search/types';

export function formatSourcesBlock(results: SearchResult[], mode: SearchMode): string {
  const lines = results
    .slice(0, MAX_FALLBACK_RESULTS)
    .map(
      (result, index) =>
        `${index + 1}. ${(result.title || result.url || 'Result').toString()} — ${result.url || ''}${result.description ? ` — ${result.description}` : ''}`,
    )
    .join('\n');
  if (!lines) return '';
  const provider = getSearchProvider(mode);
  if (provider) {
    return `\n\nWeb search results (${provider.label}):\n${lines}\n\nInstructions: Use these results to answer and cite sources inline as [n].`;
  }
  return `\n\nWeb search results:\n${lines}`;
}
