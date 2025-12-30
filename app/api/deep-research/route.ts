import { NextRequest } from 'next/server';
import { deepResearch } from '@/lib/deepResearch';
import { ProviderSort } from '@/lib/models/providerSort';
import { createNdjsonStream } from '@/lib/server/ndjson';
import { jsonError, requireServerEnv, withTiming } from '@/lib/server/route';
import { isRecord } from '@/lib/utils/guards';
import { getServerTier } from '@/lib/auth/tierApiKey';
import { rateLimit, RATE_LIMITS } from '@/lib/server/rateLimit';

export async function POST(req: NextRequest) {
  return withTiming('deep-research', async () => {
    // Rate limiting
    const rateLimitResponse = rateLimit(req, 'deep-research', RATE_LIMITS.EXPENSIVE);
    if (rateLimitResponse) return rateLimitResponse;

    // Tier check - block free tier
    const tier = await getServerTier();
    if (tier === 'free') {
      return jsonError(403, 'feature_not_available', 'Deep research is not available on the free tier');
    }

    let apiKey: string;
    try {
      apiKey = requireServerEnv('OPENROUTER_API_KEY');
    } catch {
      return jsonError(500, 'missing_env', 'OPENROUTER_API_KEY');
    }
    try {
      requireServerEnv('BRAVE_SEARCH_API_KEY');
    } catch {
      return jsonError(500, 'missing_env', 'BRAVE_SEARCH_API_KEY');
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      body = isRecord(parsed) ? parsed : {};
    } catch {
      return jsonError(400, 'invalid_json');
    }
    const task = String(body?.task || '').trim();
    const model = String(body?.model || '').trim();
    if (!task) return jsonError(400, 'missing_task');
    if (!model) return jsonError(400, 'missing_model');

    const rawProviderSort = body.providerSort;
    const providerSort =
      rawProviderSort === ProviderSort.Price || rawProviderSort === ProviderSort.Throughput
        ? (rawProviderSort as ProviderSort)
        : undefined;
    const style =
      body.style === 'concise' || body.style === 'detailed' || body.style === 'executive'
        ? body.style
        : undefined;
    const cite = body.cite === 'inline' || body.cite === 'footnotes' ? body.cite : undefined;

    const stream = createNdjsonStream(
      async ({ send }) => {
        const result = await deepResearch({
          apiKey,
          task,
          model,
          audience: typeof body.audience === 'string' ? body.audience : undefined,
          style,
          cite,
          maxIterations: typeof body.maxIterations === 'number' ? body.maxIterations : undefined,
          providerSort,
          onProgress: (event) => {
            send({ type: 'trace', data: event });
          },
        });

        send({ type: 'result', data: result });
      },
      {
        onError: (error) => ({
          type: 'error',
          error: String((error as Error)?.message || 'deep_research_error'),
        }),
      },
    );

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  });
}
