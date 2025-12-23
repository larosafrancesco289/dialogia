import { getBraveSearchKey } from '@/lib/config';
import { summarizeHtmlDocument } from '@/lib/deepResearch/html';
import type { WebSearchToolArgs } from '@/lib/tools/webSearch';

export type { WebSearchToolArgs } from '@/lib/tools/webSearch';

export type DeepSearchResult = {
  title?: string;
  url: string;
  description?: string;
};

export type DeepFetchedPage = {
  url: string;
  title?: string;
  description?: string;
  published?: string;
  headings?: string[];
  text?: string;
  bytes?: number;
};

export async function runWebSearch(args: WebSearchToolArgs): Promise<DeepSearchResult[]> {
  const apiKey = getBraveSearchKey();
  if (!apiKey) throw new Error('brave_missing_key');
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  const count = Math.min(Math.max(args.count ?? 5, 1), 10);
  url.searchParams.set('q', args.query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('country', (args.country || 'us').toLowerCase());
  url.searchParams.set('safesearch', 'moderate');
  if (args.freshness && args.freshness !== 'all') url.searchParams.set('freshness', args.freshness);
  if (args.include_domains?.length)
    url.searchParams.set('include_domains', args.include_domains.join(','));
  if (args.exclude_domains?.length)
    url.searchParams.set('exclude_domains', args.exclude_domains.join(','));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`brave_error_${res.status}`);
  const data: any = await res.json();
  const web = data?.web?.results || [];
  return web.slice(0, count).map((entry: any) => ({
    title: entry?.title,
    url: entry?.url,
    description: entry?.description,
  }));
}

export type FetchUrlToolArgs = {
  url: string;
  max_bytes?: number;
  timeout_ms?: number;
};

export async function fetchUrl(args: FetchUrlToolArgs): Promise<DeepFetchedPage> {
  const maxBytes = Math.min(Math.max(args.max_bytes ?? 800000, 1024), 4_000_000);
  const timeoutMs = Math.min(Math.max(args.timeout_ms ?? 15000, 2000), 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(args.url, {
      headers: {
        'User-Agent': 'Dialogia-DeepResearch/1.0 (+https://github.com/openai/codex-cli)',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`fetch_error_${res.status}`);

    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) break;
        html += decoder.decode(value, { stream: true });
      }
    } else {
      html = await res.text();
      if (html.length > maxBytes) html = html.slice(0, maxBytes);
    }

    const summary = summarizeHtmlDocument(html);
    return {
      url: args.url,
      ...summary,
      bytes: (summary.text || '').length,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function getCurrentTime(): { now: string } {
  return { now: new Date().toISOString() };
}
