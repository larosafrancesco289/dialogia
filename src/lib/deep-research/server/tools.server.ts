import 'server-only';
import { getBraveSearchKey } from '@/lib/env/server';
import { summarizeHtmlDocument } from '@/lib/deep-research/server/html.server';
import type { WebSearchArgs } from '@/lib/search/args';
import { runBraveSearchDirect } from '@/lib/search/api/brave';

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

export async function runWebSearch(args: WebSearchArgs): Promise<DeepSearchResult[]> {
  const apiKey = getBraveSearchKey();
  if (!apiKey) throw new Error('brave_missing_key');
  const count = Math.min(Math.max(args.count ?? 5, 1), 10);
  const results = await runBraveSearchDirect({ ...args, count }, { apiKey });
  return results.slice(0, count).map((entry) => ({
    title: entry?.title,
    url: entry?.url ?? '',
    description: entry?.description,
  }));
}

export type FetchUrlToolArgs = {
  url: string;
  max_bytes?: number;
  timeout_ms?: number;
};

export function normalizeFetchUrlArgs(input: Record<string, unknown>): FetchUrlToolArgs | null {
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!url) return null;
  const max_bytes = typeof input.max_bytes === 'number' ? input.max_bytes : undefined;
  const timeout_ms = typeof input.timeout_ms === 'number' ? input.timeout_ms : undefined;
  return { url, max_bytes, timeout_ms };
}

export async function fetchUrl(args: FetchUrlToolArgs): Promise<DeepFetchedPage> {
  const maxBytes = Math.min(Math.max(args.max_bytes ?? 800000, 1024), 4_000_000);
  const timeoutMs = Math.min(Math.max(args.timeout_ms ?? 15000, 2000), 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(args.url, {
      headers: {
        'User-Agent': 'Dialogia-DeepResearch/1.0',
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
