// Module: agent/searchFlow
// Responsibility: Centralize web search tool schema, Brave API calls, and result formatting.

import type { StoreState } from '@/lib/store/types';
import { MAX_FALLBACK_RESULTS } from '@/lib/constants';

type StoreSetter = (updater: (state: StoreState) => Partial<StoreState> | void) => void;

export function getSearchToolDefinition() {
  return [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the public web for up-to-date information. Use only when necessary. Return results to ground your answer and cite sources as [n].',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query to run.' },
            count: {
              type: 'integer',
              description: 'How many results to retrieve (1-10).',
              minimum: 1,
              maximum: 10,
            },
          },
          required: ['query'],
        },
      },
    },
  ];
}

export type SearchResult = { title?: string; url?: string; description?: string };

export async function runBraveSearch(
  query: string,
  count: number,
  opts?: {
    signal?: AbortSignal;
  },
): Promise<{ ok: boolean; results: SearchResult[]; error?: string }> {
  try {
    const res = await fetch(`/api/brave?q=${encodeURIComponent(query)}&count=${count}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: opts?.signal,
    } as any);
    if (!res.ok) {
      return {
        ok: false,
        results: [],
        error: res.status === 400 ? 'Missing BRAVE_SEARCH_API_KEY' : `HTTP ${res.status}`,
      };
    }
    const data: any = await res.json();
    const results = Array.isArray(data?.results) ? (data.results as SearchResult[]) : [];
    return { ok: true, results };
  } catch (e: any) {
    return { ok: false, results: [], error: e?.message || 'Network error' };
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
      braveByMessageId: {
        ...(state.ui.braveByMessageId || {}),
        [messageId]: entry,
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

export function formatSourcesBlock(
  results: SearchResult[],
  provider: 'brave' | 'openrouter',
): string {
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
