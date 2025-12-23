import { NextRequest } from 'next/server';
import { anthropicFetchModels } from '@/lib/api/anthropicClient';
import { jsonError, requireEnv, withTiming } from '@/lib/server/route';

export async function GET(req: NextRequest) {
  return withTiming('anthropic-models', async () => {
    const headerKey = req.headers.get('x-api-key') || undefined;
    let apiKey = headerKey;
    if (!apiKey) {
      try {
        apiKey = requireEnv('ANTHROPIC_API_KEY');
      } catch {
        apiKey = undefined;
      }
    }
    if (!apiKey) {
      return jsonError(500, 'missing_env', 'ANTHROPIC_API_KEY');
    }
    try {
      const res = await anthropicFetchModels(apiKey, {
        origin: req.headers.get('origin') || undefined,
      });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: {
          'Content-Type': res.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (error: any) {
      return jsonError(500, 'anthropic_proxy_error', error?.message || 'anthropic_proxy_error');
    }
  });
}
