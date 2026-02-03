import { NextResponse } from 'next/server';
import { runWebSearch } from '@/lib/deep-research/server/tools.server';
import { normalizeWebSearchArgs, type WebSearchArgs } from '@/lib/search/args';
import { jsonError } from '@/lib/server/route';
import { RATE_LIMITS } from '@/lib/server/rateLimit';
import { route } from '@/lib/server/routeBuilder';

export const GET = route('brave-search')
  .rateLimit('brave', RATE_LIMITS.STANDARD)
  .requireTier({
    deny: ['free'],
    message: 'Web search is not available on the free tier',
  })
  .requireEnv('BRAVE_SEARCH_API_KEY')
  .handler(async (req) => {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const rawCount = searchParams.get('count');
    const count = rawCount ? parseInt(rawCount, 10) : undefined;
    if (!q) {
      return jsonError(400, 'missing_query');
    }

    try {
      const includeDomains = searchParams.get('include_domains');
      const excludeDomains = searchParams.get('exclude_domains');
      const args: WebSearchArgs = normalizeWebSearchArgs({
        query: q,
        count,
        freshness: searchParams.get('freshness'),
        country: searchParams.get('country'),
        include_domains: includeDomains
          ? includeDomains
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          : undefined,
        exclude_domains: excludeDomains
          ? excludeDomains
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          : undefined,
        provider: 'brave',
      });

      const results = await runWebSearch(args);
      return NextResponse.json({ results });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown_error';
      if (typeof message === 'string' && message.startsWith('brave_error_')) {
        const code = Number(message.replace('brave_error_', ''));
        return jsonError(Number.isFinite(code) ? code : 502, 'brave_error', message);
      }
      return jsonError(500, 'brave_error', message);
    }
  });
