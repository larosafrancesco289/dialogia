import type { SearchResult } from '@/lib/search/types';

export const MAX_PLANNING_ROUNDS = 3;

export function shouldAppendSources(results: SearchResult[] | undefined): boolean {
  return Array.isArray(results) && results.length > 0;
}
