import { MAX_SEARCH_SOURCES } from '@/lib/constants';
import type { SearchResult } from '@/lib/search/types';

const keyOf = (result: SearchResult): string =>
  (result.url || '').trim() || `${result.title}-${result.description}`;

/**
 * A reply's sources so far, once per page and in the order first found, kept
 * to MAX_SEARCH_SOURCES. A source's place is the number [n] cites, so an
 * earlier search's sources never move when a later one adds to them.
 */
export function mergeSearchResults(groups: SearchResult[][]): SearchResult[] {
  const flat = groups.flat().filter(Boolean);
  const byUrl = new Map<string, SearchResult>();
  for (const result of flat) {
    if (byUrl.size >= MAX_SEARCH_SOURCES) break;
    const key = keyOf(result);
    if (!key) continue;
    if (!byUrl.has(key)) byUrl.set(key, result);
  }
  return Array.from(byUrl.values());
}

/**
 * One search's results under the numbers the reply's sources give them, so the
 * model cites [n] as the sources list reads; a result the full list had no
 * room for is left out.
 */
export function numberResults(
  results: SearchResult[],
  sources: SearchResult[],
): Array<SearchResult & { n: number }> {
  const place = new Map(sources.map((source, index) => [keyOf(source), index + 1]));
  const seen = new Set<number>();
  const numbered: Array<SearchResult & { n: number }> = [];
  for (const result of results) {
    const n = place.get(keyOf(result));
    if (n === undefined || seen.has(n)) continue;
    seen.add(n);
    numbered.push({ ...result, n });
  }
  return numbered;
}
