import { apiDefaults } from '@/lib/api/config';
import { deepResearch, getReasoningSupport } from '@/lib/deepResearch/server';
import { createNdjsonStream } from '@/lib/server/ndjson';
import { jsonError } from '@/lib/server/route';
import { DeepResearchRequestSchema } from '@/lib/schemas/api';
import { parseSchema } from '@/lib/schemas/parse';
import { RATE_LIMITS } from '@/lib/server/rateLimit';
import { route } from '@/lib/server/routeBuilder';
import { evaluateDeepResearchPolicy } from '@/lib/policy/deepResearch';
import { buildTransportAuth } from '@/lib/auth/transport';

export const POST = route('deep-research')
  .rateLimit('deep-research', RATE_LIMITS.EXPENSIVE)
  .requireTier({
    deny: ['free'],
    message: 'Deep research is not available on the free tier',
  })
  .requireEnv('OPENROUTER_API_KEY', 'BRAVE_SEARCH_API_KEY')
  .handler(async (req, ctx) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'invalid_json');
    }
    const parsed = parseSchema(DeepResearchRequestSchema, body);
    if (!parsed.ok) {
      const fields = new Set(parsed.error.errors.map((issue) => issue.path[0]));
      if (fields.has('task')) return jsonError(400, 'missing_task');
      if (fields.has('model')) return jsonError(400, 'missing_model');
      return jsonError(400, 'invalid_body');
    }
    const task = parsed.data.task.trim();
    const model = parsed.data.model.trim();
    if (!task) return jsonError(400, 'missing_task');
    if (!model) return jsonError(400, 'missing_model');
    const providerSort = parsed.data.providerSort;
    const style = parsed.data.style;
    const cite = parsed.data.cite;
    const origin = apiDefaults.resolveOrigin();
    const auth = buildTransportAuth({
      transport: 'openrouter',
      apiKey: ctx.env.OPENROUTER_API_KEY,
      useProxy: false,
    });
    const supportsReasoning = await getReasoningSupport(auth, model, origin);
    const policy = evaluateDeepResearchPolicy({
      searchEnabled: true,
      tutorEnabled: false,
      transport: 'openrouter',
      supportsReasoning,
      tier: ctx.tier,
    });

    if (policy.notice) {
      return jsonError(403, 'feature_not_available', policy.notice);
    }
    if (!policy.shouldRun) {
      return jsonError(400, 'reasoning_model_required');
    }

    const stream = createNdjsonStream(
      async ({ send }) => {
        const result = await deepResearch({
          auth,
          task,
          model,
          audience: parsed.data.audience,
          style,
          cite,
          maxIterations: parsed.data.maxIterations,
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
