import { NOTICE_MISSING_BRAVE_KEY } from '@/lib/store/notices';
import { runBraveSearch } from '@/lib/agent/searchFlow';
import { withAbort } from '@/lib/utils/abort';
import type {
  SearchProvider,
  SearchResult,
  StoreSetter,
  ToolExecutionResult,
  WebSearchArgs,
} from '@/lib/agent/types';
import { parseJsonAfter } from './json';
import { setSearchUiStatus } from '@/lib/agent/searchService';

function readSearchPayload(value: unknown): WebSearchArgs | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const query = typeof record.query === 'string' ? record.query.trim() : '';
  if (!query) return null;
  const rawCount = record.count;
  const count =
    typeof rawCount === 'number' && Number.isFinite(rawCount)
      ? Math.max(1, Math.min(10, Math.floor(rawCount)))
      : undefined;
  return { query, count };
}

export function extractWebSearchArgs(text: string): WebSearchArgs | null {
  if (typeof text !== 'string' || !text) return null;
  try {
    const candidates: Array<Record<string, unknown>> = [];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== '{') continue;
      const parsed = parseJsonAfter(text, i);
      if (parsed && typeof parsed.value === 'object' && parsed.value) {
        candidates.push(parsed.value as Record<string, unknown>);
        i = parsed.endIndex;
      }
    }
    for (const payload of candidates) {
      const direct = readSearchPayload(payload);
      if (direct) return direct;
      const payloadName = typeof payload.name === 'string' ? payload.name : '';
        if (payloadName === 'web_search') {
          const args = payload.arguments;
          if (typeof args === 'string') {
            try {
              const inner = JSON.parse(args);
              const nested = readSearchPayload(inner);
              if (nested) return nested;
            } catch {
              continue;
            }
          } else if (args && typeof args === 'object') {
            const nested = readSearchPayload(args);
            if (nested) return nested;
          }
        }
      }
    } catch (error) {
      console.error('Failed to extract web search args', error);
    }
    return null;
  }

export async function performWebSearchTool(opts: {
  args: WebSearchArgs;
  fallbackQuery: string;
  searchProvider: SearchProvider;
  controller: AbortController;
  assistantMessageId: string;
  chatId: string;
  set: StoreSetter;
}): Promise<ToolExecutionResult> {
  const { args, fallbackQuery, searchProvider, controller, assistantMessageId, chatId: _chatId, set } =
    opts;
  let rawQuery = typeof args?.query === 'string' ? args.query.trim() : '';
  const parsedCount = Number.parseInt(String(args?.count ?? ''), 10);
  const count = Math.min(Math.max(Number.isFinite(parsedCount) ? parsedCount : 5, 1), 10);
  if (!rawQuery) rawQuery = fallbackQuery.trim().slice(0, 256);

  if (searchProvider === 'brave') {
    setSearchUiStatus(set, assistantMessageId, { query: rawQuery, status: 'loading' });
  }

  return withAbort(controller.signal, async (fetchController) => {
    const timeout = setTimeout(() => fetchController.abort(), 20000);
    try {
      const result =
        searchProvider === 'brave'
          ? await runBraveSearch(rawQuery, count, { signal: fetchController.signal })
          : { ok: false, results: [] as SearchResult[], error: undefined };

      if (result.ok) {
        if (searchProvider === 'brave') {
          setSearchUiStatus(set, assistantMessageId, {
            query: rawQuery,
            status: 'done',
            results: result.results,
          });
        }
        return { ok: true, results: result.results, query: rawQuery };
      }

      if (searchProvider === 'brave') {
        setSearchUiStatus(set, assistantMessageId, {
          query: rawQuery,
          status: 'error',
          results: [],
          error: result.error || 'No results',
        });
      }
      if (result.error === NOTICE_MISSING_BRAVE_KEY) {
        set((state) => ({ ui: { ...state.ui, notice: NOTICE_MISSING_BRAVE_KEY } }));
      }
      return { ok: false, results: [], error: result.error, query: rawQuery };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : undefined;
      if (searchProvider === 'brave') {
        setSearchUiStatus(set, assistantMessageId, {
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
