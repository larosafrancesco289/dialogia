import { orFetchModels } from '@/lib/openrouter/http';
import { jsonError } from '@/lib/server/route';
import {
  getRequestOrigin,
  LIST_CACHE_CONTROL,
  proxyJson,
  withProxyErrors,
} from '@/lib/server/proxy';
import { resolveOpenRouterAccess } from '@/lib/openrouter/pipeline.server';
import { route } from '@/lib/server/routeBuilder';
import { RATE_LIMITS } from '@/lib/server/rateLimit';

export const GET = route('openrouter-models')
  .rateLimit('openrouter-models', RATE_LIMITS.STANDARD)
  .handler(async (req) => {
    let access: ReturnType<typeof resolveOpenRouterAccess>;
    try {
      access = resolveOpenRouterAccess(req);
    } catch {
      return jsonError(500, 'missing_env', 'OPENROUTER_API_KEY');
    }
    return withProxyErrors(async () => {
      const res = await orFetchModels(access.auth, { origin: getRequestOrigin(req) });
      return proxyJson(res, { cacheControl: res.ok ? LIST_CACHE_CONTROL : undefined });
    }, 'proxy_error');
  });
