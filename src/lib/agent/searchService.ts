// Module: agent/searchService
// Responsibility: Wrap Brave/OpenRouter search UI updates so search tools and deep research share one pathway.

import type { StoreAccess } from '@/lib/agent/types';
import type { SearchResult } from '@/lib/agent/types';

export type SearchUiPayload = {
  query: string;
  status: 'loading' | 'done' | 'error';
  results?: SearchResult[];
  error?: string;
};

export function setSearchUiStatus(store: StoreAccess, messageId: string, payload: SearchUiPayload) {
  store.get().setSearchStatus(messageId, payload);
}
