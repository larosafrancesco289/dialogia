import { getSearchProvider } from '@/lib/search/providers';
import type { SearchMode } from '@/lib/search/providers/types';
import { t } from '@/lib/i18n';

/** What to call the active search mechanism in the composer. */
export function searchModeLabel(mode?: SearchMode): string {
  return getSearchProvider(mode)?.label ?? t('search.builtIn');
}
