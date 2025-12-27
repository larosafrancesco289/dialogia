import { NextRequest } from 'next/server';
import { anthropicFetchModels } from '@/lib/api/anthropicClient';
import { jsonError, requireServerEnv, withTiming } from '@/lib/server/route';
import { getRequestOrigin, proxyJson, withProxyErrors } from '@/lib/server/proxy';

export async function GET(req: NextRequest) {
  return withTiming('anthropic-models', async () => {
    const headerKey = req.headers.get('x-api-key') || undefined;
    let apiKey = headerKey;
    if (!apiKey) {
      try {
        apiKey = requireServerEnv('ANTHROPIC_API_KEY');
      } catch {
        apiKey = undefined;
      }
    }
    if (!apiKey) {
      return jsonError(500, 'missing_env', 'ANTHROPIC_API_KEY');
    }
    return withProxyErrors(async () => {
      const res = await anthropicFetchModels(apiKey, {
        origin: getRequestOrigin(req),
      });
      return proxyJson(res);
    }, 'anthropic_proxy_error');
  });
}
