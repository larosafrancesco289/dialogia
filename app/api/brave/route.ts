import { NextRequest, NextResponse } from 'next/server';
import { runWebSearch } from '@/lib/deepResearch/tools';
import type { WebSearchToolArgs } from '@/lib/tools/webSearch';
import { jsonError, withTiming } from '@/lib/server/route';

export async function GET(req: NextRequest) {
  return withTiming('brave-search', async () => {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const rawCount = searchParams.get('count');
    const count = rawCount ? parseInt(rawCount, 10) : undefined;
    if (!q) {
      return jsonError(400, 'missing_query');
    }

    try {
      const args: WebSearchToolArgs = { query: q };
      if (Number.isFinite(count)) args.count = count;
      const freshness = searchParams.get('freshness');
      if (freshness) {
        const allowed = new Set(['d', 'w', 'm', 'y', 'all']);
        if (allowed.has(freshness)) args.freshness = freshness as WebSearchToolArgs['freshness'];
      }
      const country = searchParams.get('country');
      if (country) args.country = country;
      const includeDomains = searchParams.get('include_domains');
      if (includeDomains) {
        args.include_domains = includeDomains
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
      const excludeDomains = searchParams.get('exclude_domains');
      if (excludeDomains) {
        args.exclude_domains = excludeDomains
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
      }

      const results = await runWebSearch(args);
      return NextResponse.json({ results });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown_error';
      if (message === 'brave_missing_key') {
        return jsonError(400, 'missing_env', 'BRAVE_SEARCH_API_KEY');
      }
      if (typeof message === 'string' && message.startsWith('brave_error_')) {
        const code = Number(message.replace('brave_error_', ''));
        return jsonError(Number.isFinite(code) ? code : 502, 'brave_error', message);
      }
      return jsonError(500, 'brave_error', message);
    }
  });
}
