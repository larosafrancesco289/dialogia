import { NextRequest, NextResponse } from 'next/server';
import { requireServerOpenRouterKey } from '@/lib/config';
import { orChatCompletions } from '@/lib/api/orClient';

export async function POST(req: NextRequest) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let apiKey: string;
  try {
    apiKey = requireServerOpenRouterKey();
  } catch {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY (server)' }, { status: 500 });
  }
  try {
    const body = await req.text();
    const res = await orChatCompletions({
      apiKey,
      body,
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
