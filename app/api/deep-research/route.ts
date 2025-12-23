import { NextRequest } from 'next/server';
import { deepResearch } from '@/lib/deepResearch';
import { ProviderSort } from '@/lib/models/providerSort';
import { createNdjsonStream } from '@/lib/server/ndjson';
import { jsonError, requireEnv, withTiming } from '@/lib/server/route';

export async function POST(req: NextRequest) {
  return withTiming('deep-research', async () => {
    let apiKey: string;
    try {
      apiKey = requireEnv('OPENROUTER_API_KEY');
    } catch {
      return jsonError(500, 'missing_env', 'OPENROUTER_API_KEY');
    }
    try {
      requireEnv('BRAVE_SEARCH_API_KEY');
    } catch {
      return jsonError(500, 'missing_env', 'BRAVE_SEARCH_API_KEY');
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'invalid_json');
    }
    const task = String(body?.task || '').trim();
    const model = String(body?.model || '').trim();
    if (!task) return jsonError(400, 'missing_task');
    if (!model) return jsonError(400, 'missing_model');

    const rawProviderSort = body?.providerSort;
    const providerSort =
      rawProviderSort === ProviderSort.Price || rawProviderSort === ProviderSort.Throughput
        ? (rawProviderSort as ProviderSort)
        : undefined;

    const stream = createNdjsonStream(
      async ({ send }) => {
        const result = await deepResearch({
          apiKey,
          task,
          model,
          audience: typeof body?.audience === 'string' ? body.audience : undefined,
          style: body?.style,
          cite: body?.cite,
          maxIterations: typeof body?.maxIterations === 'number' ? body.maxIterations : undefined,
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
