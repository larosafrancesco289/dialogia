import { ApiError, readApiErrorResponse } from '@/lib/api/errors';
import type { WebSearchArgs } from '@/lib/search/args';

export type TavilySearchResult = {
  title?: string;
  url?: string;
  description?: string;
  score?: number;
};

type TavilySearchBody = {
  query: string;
  search_depth: 'basic';
  max_results: number;
  topic: 'general';
  include_answer: false;
  include_raw_content: false;
  include_images: false;
  include_favicon: false;
  include_usage: false;
  time_range?: 'day' | 'week' | 'month' | 'year';
  country?: string;
  include_domains?: string[];
  exclude_domains?: string[];
};

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const MAX_TAVILY_QUERY_LENGTH = 400;

const TIME_RANGE_BY_FRESHNESS: Record<Exclude<WebSearchArgs['freshness'], undefined>, string> = {
  d: 'day',
  w: 'week',
  m: 'month',
  y: 'year',
  all: '',
};

const COUNTRY_BY_CODE: Record<string, string> = {
  au: 'australia',
  ca: 'canada',
  de: 'germany',
  es: 'spain',
  fr: 'france',
  gb: 'united kingdom',
  ie: 'ireland',
  it: 'italy',
  uk: 'united kingdom',
  us: 'united states',
};

const normalizeTavilyQuery = (value: unknown): string => {
  const query = typeof value === 'string' ? value.trim() : '';
  return query.length > MAX_TAVILY_QUERY_LENGTH
    ? query.slice(0, MAX_TAVILY_QUERY_LENGTH).trim()
    : query;
};

const normalizeTavilyCountry = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return COUNTRY_BY_CODE[normalized] ?? normalized;
};

export function buildTavilySearchParams(args: WebSearchArgs): URLSearchParams {
  const query = normalizeTavilyQuery(args.query);
  if (!query) throw new Error('tavily_missing_query');

  const count = Math.min(Math.max(args.count ?? 5, 1), 10);
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('count', String(count));
  if (args.freshness && args.freshness !== 'all') params.set('freshness', args.freshness);
  if (args.country) params.set('country', args.country);
  if (args.include_domains?.length) params.set('include_domains', args.include_domains.join(','));
  if (args.exclude_domains?.length) params.set('exclude_domains', args.exclude_domains.join(','));
  return params;
}

export function buildTavilySearchBody(args: WebSearchArgs): TavilySearchBody {
  const query = normalizeTavilyQuery(args.query);
  if (!query) throw new Error('tavily_missing_query');

  const count = Math.min(Math.max(args.count ?? 5, 1), 10);
  const freshness = args.freshness ? TIME_RANGE_BY_FRESHNESS[args.freshness] : '';
  const country = normalizeTavilyCountry(args.country);
  const body: TavilySearchBody = {
    query,
    search_depth: 'basic',
    max_results: count,
    topic: 'general',
    include_answer: false,
    include_raw_content: false,
    include_images: false,
    include_favicon: false,
    include_usage: false,
  };

  if (freshness) body.time_range = freshness as TavilySearchBody['time_range'];
  if (country) body.country = country;
  if (args.include_domains?.length) body.include_domains = args.include_domains.slice(0, 300);
  if (args.exclude_domains?.length) body.exclude_domains = args.exclude_domains.slice(0, 150);
  return body;
}

export async function runTavilySearchDirect(
  args: WebSearchArgs,
  opts: { apiKey: string; signal?: AbortSignal },
): Promise<TavilySearchResult[]> {
  if (!opts.apiKey) throw new Error('tavily_missing_key');

  const res = await fetch(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildTavilySearchBody(args)),
    cache: 'no-store',
    signal: opts.signal,
  });

  if (!res.ok) throw new Error(`tavily_error_${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
  };
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((entry) => ({
    title: entry?.title,
    url: entry?.url,
    description: entry?.content,
    score: entry?.score,
  }));
}

export async function runTavilySearchProxy(
  args: WebSearchArgs,
  opts?: { endpoint?: string; signal?: AbortSignal },
): Promise<TavilySearchResult[]> {
  const params = buildTavilySearchParams(args);
  const endpoint = opts?.endpoint ?? '/api/tavily';
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
      code: 'tavily_proxy_failed',
      status: res.status,
      detail: res.statusText,
    });
  }
  const data = (await res.json()) as { results?: TavilySearchResult[] };
  const results = Array.isArray(data?.results) ? data.results : [];
  return results;
}
