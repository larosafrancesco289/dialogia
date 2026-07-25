// Module: search/ui/modes
// Responsibility: The search choices to offer in the composer.

import { isTavilyProxyEnabled } from '@/lib/env/public';
import { listReadySearchProviders, NATIVE_SEARCH_MODE } from '@/lib/search/providers';
import type { SearchMode } from '@/lib/search/providers/types';

export type SearchModeOption = { mode: SearchMode; label: string; description: string };

/**
 * Provider-native search always works with just a model key, so it is always
 * offered. A tool-based provider joins the list only once it has a key, which
 * is what keeps the picker from advertising something that would fail.
 */
export function listSearchModeOptions(): SearchModeOption[] {
  const options: SearchModeOption[] = [
    {
      mode: NATIVE_SEARCH_MODE,
      label: 'Built-in',
      description: "The model provider's own search",
    },
  ];
  for (const provider of listReadySearchProviders(isTavilyProxyEnabled())) {
    options.push({
      mode: provider.id,
      label: provider.label,
      description: 'Search and read pages as tool calls',
    });
  }
  return options;
}
