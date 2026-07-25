import { getSearchProvider } from '@/lib/search/providers';
import type { SearchMode } from '@/lib/search/providers/types';

/** What to call the active search mechanism in the composer. */
export function searchModeLabel(mode?: SearchMode): string {
  return getSearchProvider(mode)?.label ?? 'Built-in';
}
