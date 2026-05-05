import { NOTICE_MISSING_TAVILY_KEY } from '@/lib/store/notices';
import { runTavilySearch } from '@/lib/search/tool/runTavilySearch';
import { withAbort } from '@/lib/utils/abort';
import type { SearchProvider, SearchResult } from '@/lib/search/types';
import type { StoreGetter, StoreSetter, ToolExecutionResult } from '@/lib/agent/types';
import type { WebSearchArgs } from '@/lib/search/args';
import { setSearchUiStatus } from '@/lib/search/ui/state';
import { notify } from '@/lib/store/notify';

export async function performWebSearchTool(opts: {
  args: WebSearchArgs;
  fallbackQuery: string;
  searchProvider: SearchProvider;
  controller: AbortController;
  assistantMessageId: string;
  chatId: string;
  set: StoreSetter;
  get: StoreGetter;
}): Promise<ToolExecutionResult> {
  const {
    args,
    fallbackQuery,
    searchProvider,
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

  if (searchProvider === 'tavily') {
    setSearchUiStatus({ set, get }, assistantMessageId, { query: rawQuery, status: 'loading' });
  }

  return withAbort(controller.signal, async (fetchController) => {
    const timeout = setTimeout(() => fetchController.abort(), 20000);
    try {
      const result =
        searchProvider === 'tavily'
          ? await runTavilySearch(searchArgs, { signal: fetchController.signal })
          : { ok: false, results: [] as SearchResult[], error: undefined };

      if (result.ok) {
        if (searchProvider === 'tavily') {
          setSearchUiStatus({ set, get }, assistantMessageId, {
            query: rawQuery,
            status: 'done',
            results: result.results,
          });
        }
        return { ok: true, results: result.results, query: rawQuery };
      }

      if (searchProvider === 'tavily') {
        setSearchUiStatus({ set, get }, assistantMessageId, {
          query: rawQuery,
          status: 'error',
          results: [],
          error: result.error || 'No results',
        });
      }
      if (result.error === NOTICE_MISSING_TAVILY_KEY) {
        notify(get, NOTICE_MISSING_TAVILY_KEY);
      }
      return { ok: false, results: [], error: result.error, query: rawQuery };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : undefined;
      if (searchProvider === 'tavily') {
        setSearchUiStatus({ set, get }, assistantMessageId, {
          query: rawQuery,
          status: 'error',
          results: [],
          error: errorMessage || 'Network error',
        });
      }
      return { ok: false, results: [], error: errorMessage, query: rawQuery };
    } finally {
      clearTimeout(timeout);
    }
  });
}
