// Module: search/ui/modes
// Responsibility: The search choices to offer in the composer.

import { listReadySearchProviders, NATIVE_SEARCH_MODE } from '@/lib/search/providers';
import type { SearchMode } from '@/lib/search/providers/types';
import {
  allowsProviderExtensions,
  endpointCapabilities,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';

export type SearchModeOption = { mode: SearchMode; label: string; description: string };

/**
 * Provider-native search works with just a model key, so it is offered
 * wherever the request may carry it. A tool-based provider joins the list only
 * once it has a key, and only for an endpoint that is sent tools: the gates the
 * request itself applies, so the composer never offers a search that would
 * silently not happen.
 */
export function listSearchModeOptions(endpoint?: ProviderEndpoint): SearchModeOption[] {
  const options: SearchModeOption[] = [];
  if (!endpoint || allowsProviderExtensions(endpoint)) {
    options.push({
      mode: NATIVE_SEARCH_MODE,
      label: 'Built-in',
      description: "The model provider's own search",
    });
  }
  if (endpoint && !endpointCapabilities(endpoint).tools) return options;
  for (const provider of listReadySearchProviders()) {
    options.push({
      mode: provider.id,
      label: provider.label,
      description: 'Searches when it needs to, and reads the pages it finds',
    });
  }
  return options;
}
