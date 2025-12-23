import { NextRequest } from 'next/server';
import { orFetchModels } from '@/lib/api/openrouterClient';
import { jsonError, requireEnv, withTiming } from '@/lib/server/route';

export async function GET(req: NextRequest) {
  return withTiming('openrouter-models', async () => {
    let apiKey: string;
    try {
      apiKey = requireEnv('OPENROUTER_API_KEY');
    } catch {
      return jsonError(500, 'missing_env', 'OPENROUTER_API_KEY');
    }
    try {
      const res = await orFetchModels(apiKey, { origin: req.headers.get('origin') || undefined });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: {
          'Content-Type': res.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (e: any) {
      return jsonError(500, 'proxy_error', e?.message || 'proxy_error');
    }
  });
}
