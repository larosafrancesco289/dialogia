import { NextRequest } from 'next/server';
import { orFetchModels } from '@/lib/api/openrouterClient';
import { jsonError, withTiming } from '@/lib/server/route';
import { getRequestOrigin, proxyJson, withProxyErrors } from '@/lib/server/proxy';
import { getOpenRouterApiKeyForTier } from '@/lib/auth/tierApiKey';

export async function GET(req: NextRequest) {
  return withTiming('openrouter-models', async () => {
    let apiKey: string;
    try {
      apiKey = await getOpenRouterApiKeyForTier();
    } catch {
      return jsonError(500, 'missing_env', 'OPENROUTER_API_KEY');
    }
    return withProxyErrors(async () => {
      const res = await orFetchModels(apiKey, { origin: getRequestOrigin(req) });
      return proxyJson(res);
    }, 'proxy_error');
  });
}
