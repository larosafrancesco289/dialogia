import { NOTICE_MISSING_SEARCH_KEY } from '@/lib/store/notices';
import { withAbort } from '@/lib/utils/abort';
import { buildSearchContext, getSearchProvider } from '@/lib/search/providers';
import type { SearchMode } from '@/lib/search/providers/types';
import type { SearchResult } from '@/lib/search/types';
import type { StoreGetter, StoreSetter, ToolExecutionResult } from '@/lib/agent/types';
import type { WebSearchArgs } from '@/lib/search/args';
import { isTavilyProxyEnabled } from '@/lib/env/public';
import { setSearchUiStatus } from '@/lib/search/ui/state';
import { notify } from '@/lib/store/notify';

export async function performWebSearchTool(opts: {
  args: WebSearchArgs;
  fallbackQuery: string;
  searchProvider: SearchMode;
  controller: AbortController;
  assistantMessageId: string;
  chatId: string;
  set: StoreSetter;
  get: StoreGetter;
}): Promise<ToolExecutionResult> {
  const {
    args,
    fallbackQuery,
    searchProvider: mode,
    controller,
    assistantMessageId,
    chatId: _chatId,
    set,
    get,
  } = opts;
  let rawQuery = typeof args?.query === 'string' ? args.query.trim() : '';
  const parsedCount = Number.parseInt(String(args?.count ?? ''), 10);
  const count = Math.min(Math.max(Number.isFinite(parsedCount) ? parsedCount : 5, 1), 10);
  if (!rawQuery) rawQuery = fallbackQuery.trim().slice(0, 256);
  const searchArgs: WebSearchArgs = { ...args, query: rawQuery, count };

  const provider = getSearchProvider(mode);
  if (!provider) {
    // Native search never reaches here: it is a request-body flag, not a tool.
    return { ok: false, results: [], error: 'unsupported_search_provider', query: rawQuery };
  }

  setSearchUiStatus({ set, get }, assistantMessageId, { query: rawQuery, status: 'loading' });

  const hasNarrowingFilters =
    (searchArgs.freshness && searchArgs.freshness !== 'all') ||
    !!searchArgs.country ||
    !!searchArgs.include_domains?.length ||
    !!searchArgs.exclude_domains?.length;

  return withAbort(controller.signal, async (fetchController) => {
    const timeout = setTimeout(() => fetchController.abort(), 20000);
    try {
      const context = buildSearchContext(provider, {
        useProxy: isTavilyProxyEnabled(),
        signal: fetchController.signal,
      });
      let result = await provider.search(searchArgs, context);

      // Narrow filters (especially tight freshness windows) routinely intersect
      // to an empty set; retry once unfiltered before reporting zero results.
      if (result.ok && result.results.length === 0 && hasNarrowingFilters) {
        const {
          freshness: _f,
          country: _c,
          include_domains: _i,
          exclude_domains: _e,
          ...rest
        } = searchArgs;
        result = await provider.search(rest, context);
      }

      if (result.ok) {
        setSearchUiStatus({ set, get }, assistantMessageId, {
          query: rawQuery,
          status: 'done',
          results: result.results,
        });
        return { ok: true, results: result.results as SearchResult[], query: rawQuery };
      }

      setSearchUiStatus({ set, get }, assistantMessageId, {
        query: rawQuery,
        status: 'error',
        results: [],
        error: result.error || 'No results',
      });
      if (result.error === NOTICE_MISSING_SEARCH_KEY) {
        notify(get, NOTICE_MISSING_SEARCH_KEY);
      }
      return { ok: false, results: [], error: result.error, query: rawQuery };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : undefined;
      setSearchUiStatus({ set, get }, assistantMessageId, {
        query: rawQuery,
        status: 'error',
        results: [],
        error: errorMessage || 'Network error',
      });
      return { ok: false, results: [], error: errorMessage, query: rawQuery };
    } finally {
      clearTimeout(timeout);
    }
  });
}
