import { NOTICE_MISSING_BRAVE_KEY } from '@/lib/store/notices';
import { runBraveSearchProxy } from '@/lib/search/api/brave';
import { isApiError } from '@/lib/api/errors';
import type { SearchResult } from '@/lib/search/types';
import { err, ok, type Result } from '@/lib/utils/result';

export async function runBraveSearch(
  query: string,
  count: number,
  opts?: { signal?: AbortSignal },
): Promise<Result<{ results: SearchResult[] }, string | undefined>> {
  try {
    const results = await runBraveSearchProxy({ query, count }, { signal: opts?.signal });
    return ok({ results });
  } catch (error: unknown) {
    if (isApiError(error)) {
      const detail =
        typeof error.detail === 'string' && error.detail.trim() ? error.detail : undefined;
      if (error.code === 'missing_env' && error.detail === 'BRAVE_SEARCH_API_KEY') {
        return err(NOTICE_MISSING_BRAVE_KEY, { results: [] });
      }
      return err(detail ?? error.code, { results: [] });
    }
    const message = error instanceof Error ? error.message : 'Network error';
    return err(message, { results: [] });
  }
}
