import { anFetchModels } from '@/lib/anthropic/http';
import { resolveAnthropicAccess } from '@/lib/anthropic/pipeline.server';
import { jsonError } from '@/lib/server/route';
import { getRequestOrigin, proxyJson, withProxyErrors } from '@/lib/server/proxy';
import { route } from '@/lib/server/routeBuilder';
import { RATE_LIMITS } from '@/lib/server/rateLimit';

export const GET = route('anthropic-models')
  .rateLimit('anthropic-models', RATE_LIMITS.ANTHROPIC_MODELS)
  .handler(async (req) => {
    let access: ReturnType<typeof resolveAnthropicAccess>;
    try {
      access = resolveAnthropicAccess(req);
    } catch {
      return jsonError(500, 'missing_env', 'ANTHROPIC_API_KEY');
    }

    return withProxyErrors(async () => {
      const res = await anFetchModels(access.auth, { origin: getRequestOrigin(req) });
      return proxyJson(res);
    }, 'proxy_error');
  });
