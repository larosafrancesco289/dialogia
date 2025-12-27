import { NextRequest } from 'next/server';
import { orFetchZdrEndpoints } from '@/lib/api/openrouterClient';
import { jsonError, withTiming } from '@/lib/server/route';

export async function GET(req: NextRequest) {
  return withTiming('openrouter-zdr-endpoints', async () => {
    try {
      const res = await orFetchZdrEndpoints({ origin: req.headers.get('origin') || undefined });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: {
          'Content-Type': res.headers.get('content-type') || 'application/json',
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'proxy_error';
      return jsonError(500, 'proxy_error', message);
    }
  });
}
