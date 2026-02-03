import type { SearchResult } from '@/lib/search/types';

export function mergeSearchResults(groups: SearchResult[][]): SearchResult[] {
  const flat = groups.flat().filter(Boolean);
  const byUrl = new Map<string, SearchResult>();
  for (const result of flat) {
    const key = (result.url || '').trim() || `${result.title}-${result.description}`;
    if (!key) continue;
    if (!byUrl.has(key)) byUrl.set(key, result);
  }
  return Array.from(byUrl.values());
}
