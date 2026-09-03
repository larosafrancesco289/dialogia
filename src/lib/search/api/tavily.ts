import type { WebFetchArgs, WebSearchArgs } from '@/lib/search/args';

export type TavilySearchResult = {
  title?: string;
  url?: string;
  description?: string;
  score?: number;
};

export type TavilyFetchResult = {
  url?: string;
  raw_content?: string;
  images?: string[];
  favicon?: string;
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

type TavilyExtractBody = {
  urls: string;
  extract_depth: 'basic' | 'advanced';
  format: 'markdown' | 'text';
  include_images: boolean;
  include_favicon: boolean;
  include_usage: false;
  query?: string;
  chunks_per_source?: number;
};

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';
const MAX_TAVILY_QUERY_LENGTH = 400;
const MAX_TAVILY_EXTRACT_QUERY_LENGTH = 300;

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

const normalizeTavilyUrl = (value: unknown): string => {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
};

export function buildTavilyExtractParams(args: WebFetchArgs): URLSearchParams {
  const url = normalizeTavilyUrl(args.url);
  if (!url) throw new Error('tavily_missing_url');

  const params = new URLSearchParams();
  params.set('url', url);
  if (args.extract_depth) params.set('extract_depth', args.extract_depth);
  if (args.format) params.set('format', args.format);
  if (typeof args.include_images === 'boolean') {
    params.set('include_images', args.include_images ? 'true' : 'false');
  }
  if (typeof args.include_favicon === 'boolean') {
    params.set('include_favicon', args.include_favicon ? 'true' : 'false');
  }
  if (args.query) params.set('query', args.query.slice(0, MAX_TAVILY_EXTRACT_QUERY_LENGTH));
  if (args.chunks_per_source) params.set('chunks_per_source', String(args.chunks_per_source));
  return params;
}

export function buildTavilyExtractBody(args: WebFetchArgs): TavilyExtractBody {
  const url = normalizeTavilyUrl(args.url);
  if (!url) throw new Error('tavily_missing_url');

  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const body: TavilyExtractBody = {
    urls: url,
    extract_depth: args.extract_depth === 'advanced' ? 'advanced' : 'basic',
    format: args.format === 'text' ? 'text' : 'markdown',
    include_images: args.include_images === true,
    include_favicon: args.include_favicon === true,
    include_usage: false,
  };
  if (query) {
    body.query = query.slice(0, MAX_TAVILY_EXTRACT_QUERY_LENGTH);
    body.chunks_per_source = Math.min(Math.max(args.chunks_per_source ?? 3, 1), 5);
  }
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

export async function runTavilyExtractDirect(
  args: WebFetchArgs,
  opts: { apiKey: string; signal?: AbortSignal },
): Promise<TavilyFetchResult[]> {
  if (!opts.apiKey) throw new Error('tavily_missing_key');

  const res = await fetch(TAVILY_EXTRACT_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildTavilyExtractBody(args)),
    cache: 'no-store',
    signal: opts.signal,
  });

  if (!res.ok) throw new Error(`tavily_error_${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{ url?: string; raw_content?: string; images?: string[]; favicon?: string }>;
  };
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((entry) => ({
    url: entry?.url,
    raw_content: entry?.raw_content,
    images: Array.isArray(entry?.images) ? entry.images : undefined,
    favicon: entry?.favicon,
  }));
}
