// Module: agent/searchFlow
// Responsibility: Centralize web search tool schema, Brave API calls, and result formatting.

import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
import type { SearchProvider, SearchResult, ToolDefinition, StoreSetter } from '@/lib/agent/types';
import { NOTICE_MISSING_BRAVE_KEY } from '@/lib/store/notices';
import { getWebSearchToolDefinition } from '@/lib/tools/webSearch';
import { runBraveSearchProxy } from '@/lib/search/brave';
import { isApiError } from '@/lib/api/errors';

export function getSearchToolDefinition(): ToolDefinition[] {
  return getWebSearchToolDefinition();
}

export async function runBraveSearch(
  query: string,
  count: number,
  opts?: {
    signal?: AbortSignal;
  },
): Promise<{ ok: boolean; results: SearchResult[]; error?: string }> {
  try {
    const results = await runBraveSearchProxy({ query, count }, { signal: opts?.signal });
    return { ok: true, results };
  } catch (e: unknown) {
    if (isApiError(e)) {
      const detail = typeof e.detail === 'string' && e.detail.trim() ? e.detail : undefined;
      if (e.code === 'missing_env' && e.detail === 'BRAVE_SEARCH_API_KEY') {
        return { ok: false, results: [], error: NOTICE_MISSING_BRAVE_KEY };
      }
      return { ok: false, results: [], error: detail ?? e.code };
    }
    const message = e instanceof Error ? e.message : 'Network error';
    return { ok: false, results: [], error: message };
  }
}

export function updateBraveUi(
  set: StoreSetter,
  messageId: string,
  entry: {
    query: string;
    status: 'loading' | 'done' | 'error';
    results?: SearchResult[];
    error?: string;
  },
) {
  set((state) => ({
    ui: {
      ...state.ui,
      search: {
        ...state.ui.search,
        braveByMessageId: {
          ...(state.ui.search.braveByMessageId || {}),
          [messageId]: entry,
        },
      },
    },
  }));
}

export function mergeSearchResults(groups: SearchResult[][]): SearchResult[] {
  const flat = groups.flat().filter(Boolean);
  const byUrl = new Map<string, SearchResult>();
  for (const r of flat) {
    const key = (r.url || '').trim() || `${r.title}-${r.description}`;
    if (!key) continue;
    if (!byUrl.has(key)) byUrl.set(key, r);
  }
  return Array.from(byUrl.values());
}

export function formatSourcesBlock(results: SearchResult[], provider: SearchProvider): string {
  const lines = results
    .slice(0, MAX_FALLBACK_RESULTS)
    .map(
      (r, i) =>
        `${i + 1}. ${(r.title || r.url || 'Result').toString()} — ${r.url || ''}${r.description ? ` — ${r.description}` : ''}`,
    )
    .join('\n');
  if (!lines) return '';
  if (provider === 'brave') {
    return `\n\nWeb search results (Brave):\n${lines}\n\nInstructions: Use these results to answer and cite sources inline as [n].`;
  }
  return `\n\nWeb search results:\n${lines}`;
}
