// Module: agent/searchService
// Responsibility: Wrap Brave/OpenRouter search UI updates so search tools and deep research share one pathway.

import type { StoreSetter } from '@/lib/agent/types';
import type { SearchResult } from '@/lib/agent/types';
import { updateBraveUi } from '@/lib/agent/searchFlow';

export type SearchUiPayload = {
  query: string;
  status: 'loading' | 'done' | 'error';
  results?: SearchResult[];
  error?: string;
};

export function setSearchUiStatus(
  set: StoreSetter,
  messageId: string,
  payload: SearchUiPayload,
) {
  updateBraveUi(set, messageId, payload);
}
