import { orFetchZdrEndpoints } from '@/lib/openrouter/http';
import {
  getRequestOrigin,
  LIST_CACHE_CONTROL,
  proxyJson,
  withProxyErrors,
} from '@/lib/server/proxy';
import { route } from '@/lib/server/routeBuilder';
import { RATE_LIMITS } from '@/lib/server/rateLimit';

export const GET = route('openrouter-zdr-endpoints')
  .rateLimit('openrouter-zdr', RATE_LIMITS.STANDARD)
  .handler(async (req) => {
    return withProxyErrors(async () => {
      const res = await orFetchZdrEndpoints({ origin: getRequestOrigin(req) });
      return proxyJson(res, { cacheControl: res.ok ? LIST_CACHE_CONTROL : undefined });
    }, 'proxy_error');
  });
