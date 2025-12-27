import { NextRequest } from 'next/server';
import { orChatCompletions } from '@/lib/api/openrouterClient';
import { getOpenRouterApiKeyForTier, canUseTierModel, getServerTier } from '@/lib/auth/tierApiKey';
import { jsonError, withTiming } from '@/lib/server/route';
import { getRequestOrigin, proxyJson, proxyStream, withProxyErrors } from '@/lib/server/proxy';

export async function POST(req: NextRequest) {
  return withTiming('openrouter-chat', async () => {
    let apiKey: string;
    try {
      apiKey = await getOpenRouterApiKeyForTier();
    } catch {
      return jsonError(500, 'missing_env', 'OPENROUTER_API_KEY');
    }

    return withProxyErrors(async () => {
      const bodyText = await req.text();
      let body: Record<string, unknown> | null = null;
      let stream = false;
      try {
        body = JSON.parse(bodyText) as Record<string, unknown>;
        stream = body?.stream === true;
      } catch {
        body = null;
        stream = false;
      }

      // Validate model access for free tier
      const tier = await getServerTier();
      if (tier === 'free' && typeof body?.model === 'string') {
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
        body: bodyText,
        stream,
        origin: getRequestOrigin(req),
      });

      return stream ? proxyStream(res) : proxyJson(res);
    }, 'proxy_error');
  });
}
