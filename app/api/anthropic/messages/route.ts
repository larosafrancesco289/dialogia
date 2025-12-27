import { NextRequest } from 'next/server';
import { anthropicMessages } from '@/lib/api/anthropicClient';
import { jsonError, requireEnv, withTiming } from '@/lib/server/route';

export async function POST(req: NextRequest) {
  return withTiming('anthropic-messages', async () => {
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
        origin: req.headers.get('origin') || undefined,
      });
      const contentType = res.headers.get('content-type') || 'application/json';
      return new Response(res.body, {
        status: res.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'anthropic_proxy_error';
      return jsonError(500, 'anthropic_proxy_error', message);
    }
  });
}
