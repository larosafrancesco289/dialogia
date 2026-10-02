import type { SearchResult } from '@/lib/search/types';

// Enough for a memory save to recover from one wrong guess at its folder.
export const MAX_PLANNING_ROUNDS = 4;

export function shouldAppendSources(results: SearchResult[] | undefined): boolean {
  return Array.isArray(results) && results.length > 0;
}
