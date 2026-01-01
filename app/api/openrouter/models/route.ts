import { orFetchModels } from '@/lib/openrouter/http';
import { jsonError } from '@/lib/server/route';
import { getRequestOrigin, proxyJson, withProxyErrors } from '@/lib/server/proxy';
import { getOpenRouterApiKeyForTier } from '@/lib/auth/tierApiKey';
import { route } from '@/lib/server/routeBuilder';
import { RATE_LIMITS } from '@/lib/server/rateLimit';

export const GET = route('openrouter-models')
  .rateLimit('openrouter-models', RATE_LIMITS.STANDARD)
  .handler(async (req) => {
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
