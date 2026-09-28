// Module: search/api/openrouterSearch
// Responsibility: Run one web search through OpenRouter on the user's own key.
//
// OpenRouter has no search-only endpoint, so a search is a tiny chat call on a
// cheap model with the `web` plugin, and the results are read back from the
// message's `url_citation` annotations. The engine is named explicitly: "auto"
// would hand OpenAI and Anthropic models to their own, differently priced search.

import { orChatCompletions } from '@/lib/openrouter/http';
import type { OpenRouterChatRequest } from '@/lib/openrouter/types';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import type { WebSearchArgs } from '@/lib/search/args';
import type { SearchResult } from '@/lib/search/types';
import { SearchStatusError } from '@/lib/search/api/shared';
import { isRecord } from '@/lib/utils/guards';

/** No reasoning to pay for, and it has zero-data-retention endpoints. */
export const OPENROUTER_SEARCH_MODEL = 'mistralai/mistral-small-3.2-24b-instruct';
/** About $0.001 a search (September 2026); Exa is the pricier alternative. */
export const OPENROUTER_SEARCH_ENGINE = 'parallel';

const MAX_QUERY_LENGTH = 400;

// If OpenRouter only annotates what the answer cites, asking for every result
// keeps the list whole.
const SEARCH_INSTRUCTIONS =
  'List every web search result you were given, one line each, citing each one. Add nothing else.';

export function buildOpenRouterSearchBody(args: WebSearchArgs): OpenRouterChatRequest {
  const query = typeof args.query === 'string' ? args.query.trim().slice(0, MAX_QUERY_LENGTH) : '';
  if (!query) throw new Error('openrouter_search_missing_query');
  const count = Math.min(Math.max(args.count ?? 5, 1), 10);
  return {
    model: OPENROUTER_SEARCH_MODEL,
    messages: [
      { role: 'system', content: SEARCH_INSTRUCTIONS },
      { role: 'user', content: query },
    ],
    plugins: [{ id: 'web', engine: OPENROUTER_SEARCH_ENGINE, max_results: count }],
    max_tokens: 400,
    stream: false,
    // Nobody sees this call, so it should keep nothing: zero data retention, always.
    provider: { zdr: true },
  };
}

/** The results in the order OpenRouter gave them, one per URL. */
export function readSearchAnnotations(data: unknown): SearchResult[] {
  const choices = isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
  const message = isRecord(choices[0]) && isRecord(choices[0].message) ? choices[0].message : {};
  const annotations = Array.isArray(message.annotations) ? message.annotations : [];
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const annotation of annotations) {
    if (!isRecord(annotation) || annotation.type !== 'url_citation') continue;
    const citation = isRecord(annotation.url_citation) ? annotation.url_citation : undefined;
    const url = typeof citation?.url === 'string' ? citation.url : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    results.push({
      url,
      title: typeof citation?.title === 'string' ? citation.title : undefined,
      description: typeof citation?.content === 'string' ? citation.content : undefined,
    });
  }
  return results;
}

export async function runOpenRouterSearch(
  args: WebSearchArgs,
  opts: { apiKey: string; signal?: AbortSignal },
): Promise<SearchResult[]> {
  const res = await orChatCompletions({
    auth: { endpoint: OPENROUTER_ENDPOINT, apiKey: opts.apiKey },
    body: buildOpenRouterSearchBody(args),
    signal: opts.signal,
  });
  if (!res.ok) throw new SearchStatusError(res.status);
  return readSearchAnnotations(await res.json());
}
