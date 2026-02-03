import { ApiError, readApiErrorResponse } from '@/lib/api/errors';
import type { WebSearchArgs } from '@/lib/search/args';

export type BraveSearchResult = {
  title?: string;
  url?: string;
  description?: string;
};

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

export function buildBraveSearchParams(args: WebSearchArgs): URLSearchParams {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) throw new Error('brave_missing_query');

  const count = Math.min(Math.max(args.count ?? 5, 1), 10);
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('count', String(count));
  params.set('country', (args.country || 'us').toLowerCase());
  params.set('safesearch', 'moderate');
  if (args.freshness && args.freshness !== 'all') params.set('freshness', args.freshness);
  if (args.include_domains?.length) params.set('include_domains', args.include_domains.join(','));
  if (args.exclude_domains?.length) params.set('exclude_domains', args.exclude_domains.join(','));
  return params;
}

export async function runBraveSearchDirect(
  args: WebSearchArgs,
  opts: { apiKey: string; signal?: AbortSignal },
): Promise<BraveSearchResult[]> {
  if (!opts.apiKey) throw new Error('brave_missing_key');
  const params = buildBraveSearchParams(args);
  const url = new URL(BRAVE_SEARCH_URL);
  url.search = params.toString();

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': opts.apiKey,
    },
    cache: 'no-store',
    signal: opts.signal,
  });

  if (!res.ok) throw new Error(`brave_error_${res.status}`);
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  const web = Array.isArray(data?.web?.results) ? data.web?.results : [];
  return web.map((entry) => ({
    title: entry?.title,
    url: entry?.url,
    description: entry?.description,
  }));
}

export async function runBraveSearchProxy(
  args: WebSearchArgs,
  opts?: { endpoint?: string; signal?: AbortSignal },
): Promise<BraveSearchResult[]> {
  const params = buildBraveSearchParams(args);
  const endpoint = opts?.endpoint ?? '/api/brave';
  const separator = endpoint.includes('?') ? '&' : '?';
  const res = await fetch(`${endpoint}${separator}${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: opts?.signal,
  });

  if (!res.ok) {
    const apiError = await readApiErrorResponse(res);
    if (apiError?.error) {
      throw new ApiError({
        code: apiError.error,
        status: res.status,
        detail: apiError.detail,
      });
    }
    throw new ApiError({
      code: 'brave_proxy_failed',
      status: res.status,
      detail: res.statusText,
    });
  }
  const data = (await res.json()) as { results?: BraveSearchResult[] };
  const results = Array.isArray(data?.results) ? data.results : [];
  return results;
}
