import { getTavilyApiKey } from '@/lib/env/server';
import { runTavilyExtractDirect, runTavilySearchDirect } from '@/lib/search/api/tavily';
import {
  normalizeWebFetchArgs,
  normalizeWebSearchArgs,
  type WebFetchArgs,
  type WebSearchArgs,
} from '@/lib/search/args';
import { jsonError } from '@/lib/server/route';
import { RATE_LIMITS } from '@/lib/server/rateLimit';
import { route } from '@/lib/server/routeBuilder';

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = route('tavily-search')
  .rateLimit('tavily', RATE_LIMITS.STANDARD)
  .requireTier({
    deny: ['free'],
    message: 'Web search is not available on the free tier',
  })
  .requireEnv('TAVILY_API_KEY')
  .handler(async (req) => {
    const { searchParams } = new URL(req.url);
    const url = (searchParams.get('url') || '').trim();
    const q = (searchParams.get('q') || '').trim();
    const rawCount = searchParams.get('count');
    const count = rawCount ? parseInt(rawCount, 10) : undefined;
    if (!q && !url) {
      return jsonError(400, 'missing_query');
    }

    try {
      const apiKey = getTavilyApiKey();
      if (url) {
        const rawChunks = searchParams.get('chunks_per_source');
        const chunksPerSource = rawChunks ? parseInt(rawChunks, 10) : undefined;
        const args: WebFetchArgs = normalizeWebFetchArgs({
          url,
          extract_depth: searchParams.get('extract_depth'),
          format: searchParams.get('format'),
          include_images: searchParams.get('include_images') === 'true',
          include_favicon: searchParams.get('include_favicon') === 'true',
          query: searchParams.get('query'),
          chunks_per_source: chunksPerSource,
          provider: 'tavily',
        });

        const results = await runTavilyExtractDirect(args, { apiKey: apiKey || '' });
        return json({ results });
      }

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
        provider: 'tavily',
      });

      const results = await runTavilySearchDirect(args, { apiKey: apiKey || '' });
      return json({ results });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown_error';
      if (typeof message === 'string' && message.startsWith('tavily_error_')) {
        const code = Number(message.replace('tavily_error_', ''));
        return jsonError(Number.isFinite(code) ? code : 502, 'tavily_error', message);
      }
      return jsonError(500, 'tavily_error', message);
    }
  });
