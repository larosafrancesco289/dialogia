import { NextRequest } from 'next/server';
import { orChatCompletions } from '@/lib/api/openrouterClient';
import { getOpenRouterApiKeyForTier, canUseTierModel, getServerTier } from '@/lib/auth/tierApiKey';
import { jsonError, withTiming } from '@/lib/server/route';

export async function POST(req: NextRequest) {
  return withTiming('openrouter-chat', async () => {
    let apiKey: string;
    try {
      apiKey = await getOpenRouterApiKeyForTier();
    } catch {
      return jsonError(500, 'missing_env', 'OPENROUTER_API_KEY');
    }

    try {
      const bodyText = await req.text();
      const body = JSON.parse(bodyText);

      // Validate model access for free tier
      const tier = await getServerTier();
      if (tier === 'free' && body.model) {
        const allowed = await canUseTierModel(body.model);
        if (!allowed) {
          return jsonError(
            403,
            'model_not_allowed',
            'This model is not available on the free tier',
          );
        }
      }

      const res = await orChatCompletions({
        apiKey,
        body: JSON.stringify(body),
        stream: true,
        origin: req.headers.get('origin') || undefined,
      });

      // Pass through streaming or JSON response as-is
      const contentType = res.headers.get('content-type') || 'application/json';
      return new Response(res.body, {
        status: res.status,
        headers: {
          'Content-Type': contentType,
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'proxy_error';
      return jsonError(500, 'proxy_error', message);
    }
  });
}
