import { NOTICE_MISSING_SEARCH_KEY } from '@/lib/store/notices';
import { withAbort } from '@/lib/utils/abort';
import { buildSearchContext, getSearchProvider } from '@/lib/search/providers';
import type { SearchMode } from '@/lib/search/providers/types';
import type { SearchResult } from '@/lib/search/types';
import type { StoreGetter, StoreSetter, ToolExecutionResult } from '@/lib/agent/types';
import type { WebSearchArgs } from '@/lib/search/args';
import { setSearchUiStatus } from '@/lib/search/ui/state';
import { notify } from '@/lib/store/notify';
import { TOOL_CALL_STOPPED } from '@/lib/constants';

const SEARCH_TIMEOUT_MS = 20000;

export async function performWebSearchTool(opts: {
  args: WebSearchArgs;
  fallbackQuery: string;
  searchProvider: SearchMode;
  controller: AbortController;
  assistantMessageId: string;
  chatId: string;
  set: StoreSetter;
  get: StoreGetter;
  /** What this turn's earlier searches found: they stay listed, and cited, whatever this one does. */
  earlierResults?: SearchResult[];
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
    earlierResults = [],
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

  setSearchUiStatus({ set, get }, assistantMessageId, {
    query: rawQuery,
    status: 'loading',
    results: earlierResults,
  });

  const hasNarrowingFilters =
    (searchArgs.freshness && searchArgs.freshness !== 'all') ||
    !!searchArgs.country ||
    !!searchArgs.include_domains?.length ||
    !!searchArgs.exclude_domains?.length;

  return withAbort(controller.signal, async (fetchController) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      fetchController.abort();
    }, SEARCH_TIMEOUT_MS);
    // An abort reads as the provider's raw message ("signal is aborted without
    // reason"); what the person needs is why it ended.
    const failed = (error?: string) => {
      const reason = controller.signal.aborted
        ? TOOL_CALL_STOPPED
        : timedOut
          ? 'The search took too long.'
          : error || 'The search failed.';
      // A failure only reads as the search's state when nothing was found.
      setSearchUiStatus(
        { set, get },
        assistantMessageId,
        earlierResults.length > 0
          ? { query: rawQuery, status: 'done', results: earlierResults }
          : { query: rawQuery, status: 'error', results: [], error: reason },
      );
      return { ok: false, results: [], error: reason, query: rawQuery };
    };
    try {
      const context = buildSearchContext(provider, { signal: fetchController.signal });
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

      if (result.error === NOTICE_MISSING_SEARCH_KEY) {
        notify(get, NOTICE_MISSING_SEARCH_KEY, 'info');
      }
      return failed(result.error);
    } catch (err: unknown) {
      return failed(err instanceof Error ? err.message : undefined);
    } finally {
      clearTimeout(timeout);
    }
  });
}
