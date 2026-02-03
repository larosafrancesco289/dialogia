import type { StoreAccess } from '@/lib/agent/types';
import type { SearchResult } from '@/lib/search/types';

export type SearchUiPayload = {
  query: string;
  status: 'loading' | 'done' | 'error';
  results?: SearchResult[];
  error?: string;
};

export function setSearchUiStatus(store: StoreAccess, messageId: string, payload: SearchUiPayload) {
  store.get().setSearchStatus(messageId, payload);
}
