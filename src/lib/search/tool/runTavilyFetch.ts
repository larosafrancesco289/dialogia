import { NOTICE_MISSING_TAVILY_KEY } from '@/lib/store/notices';
import { runTavilyExtractProxy, type TavilyFetchResult } from '@/lib/search/api/tavily';
import { isApiError } from '@/lib/api/errors';
import type { WebFetchArgs } from '@/lib/search/args';
import { err, ok, type Result } from '@/lib/utils/result';

export async function runTavilyFetch(
  args: WebFetchArgs,
  opts?: { signal?: AbortSignal },
): Promise<Result<{ results: TavilyFetchResult[] }, string | undefined>> {
  try {
    const results = await runTavilyExtractProxy(args, { signal: opts?.signal });
    return ok({ results });
  } catch (error: unknown) {
    if (isApiError(error)) {
      const detail =
        typeof error.detail === 'string' && error.detail.trim() ? error.detail : undefined;
      if (error.code === 'missing_env' && error.detail === 'TAVILY_API_KEY') {
        return err(NOTICE_MISSING_TAVILY_KEY, { results: [] });
      }
      return err(detail ?? error.code, { results: [] });
    }
    const message = error instanceof Error ? error.message : 'Network error';
    return err(message, { results: [] });
  }
}
