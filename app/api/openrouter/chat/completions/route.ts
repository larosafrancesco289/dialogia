import { NextRequest, NextResponse } from 'next/server';
import { orChatCompletions } from '@/lib/api/openrouterClient';
import { getOpenRouterApiKeyForTier, canUseTierModel, getServerTier } from '@/lib/auth/tierApiKey';

export async function POST(req: NextRequest) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  let apiKey: string;
  try {
    apiKey = await getOpenRouterApiKeyForTier();
  } catch {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY (server)' }, { status: 500 });
  }

  try {
    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    // Validate model access for free tier
    const tier = await getServerTier();
    if (tier === 'free' && body.model) {
      const allowed = await canUseTierModel(body.model);
      if (!allowed) {
        return NextResponse.json(
          { error: 'model_not_allowed', message: 'This model is not available on the free tier' },
          { status: 403 },
        );
      }
    }

    const res = await orChatCompletions({
      apiKey,
      body: JSON.stringify(body),
      stream: true,
      origin: req.headers.get('origin') || undefined,
    });

    // Pass through streaming or JSON response as-is
    const contentType = res.headers.get('content-type') || 'application/json';
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);

    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Server-Timing': `proxy;dur=${dur.toFixed(1)}`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'proxy_error' }, { status: 500 });
  }
}
