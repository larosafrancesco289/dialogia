import { NextRequest } from 'next/server';
import { anthropicMessages } from '@/lib/api/anthropicClient';
import { jsonError, requireServerEnv, withTiming } from '@/lib/server/route';
import { getRequestOrigin, proxyStream, withProxyErrors } from '@/lib/server/proxy';

export async function POST(req: NextRequest) {
  return withTiming('anthropic-messages', async () => {
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
      const body = await req.text();
      let stream = false;
      try {
        const parsed = JSON.parse(body);
        stream = parsed?.stream === true;
      } catch {
        stream = false;
      }
      const res = await anthropicMessages({
        apiKey,
        body,
        stream,
        origin: getRequestOrigin(req),
      });
      return proxyStream(res);
    }, 'anthropic_proxy_error');
  });
}
