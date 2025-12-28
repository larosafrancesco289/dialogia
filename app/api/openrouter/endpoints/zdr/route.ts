import { NextRequest } from 'next/server';
import { orFetchZdrEndpoints } from '@/lib/api/openrouterHttp';
import { withTiming } from '@/lib/server/route';
import { getRequestOrigin, proxyJson, withProxyErrors } from '@/lib/server/proxy';

export async function GET(req: NextRequest) {
  return withTiming('openrouter-zdr-endpoints', async () => {
    return withProxyErrors(async () => {
      const res = await orFetchZdrEndpoints({ origin: getRequestOrigin(req) });
      return proxyJson(res);
    }, 'proxy_error');
  });
}
