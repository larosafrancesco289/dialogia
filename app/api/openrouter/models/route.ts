import { NextRequest, NextResponse } from 'next/server';
import { requireServerOpenRouterKey } from '@/lib/config';
import { orFetchModels } from '@/lib/api/openrouterClient';

export async function GET(req: NextRequest) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let apiKey: string;
  try {
    apiKey = requireServerOpenRouterKey();
  } catch {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY (server)' }, { status: 500 });
  }
  try {
    const res = await orFetchModels(apiKey, { origin: req.headers.get('origin') || undefined });
    const body = await res.text();
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
        'Server-Timing': `proxy;dur=${dur.toFixed(1)}`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'proxy_error' }, { status: 500 });
  }
}
