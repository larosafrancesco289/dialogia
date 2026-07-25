import type { ToolDefinition } from '@/lib/transport/contracts';
import { getSearchProvider } from '@/lib/search/providers';
import type { SearchMode } from '@/lib/search/providers/types';
import { getWebSearchToolDefinition } from '@/lib/tools/definitions';

export function getSearchToolDefinition(mode?: SearchMode): ToolDefinition[] {
  const provider = getSearchProvider(mode);
  return getWebSearchToolDefinition({ canFetchPage: typeof provider?.fetchPage === 'function' });
}
