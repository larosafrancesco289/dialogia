import { NextRequest, NextResponse } from 'next/server';

const OR_BASE = 'https://openrouter.ai/api/v1';

export async function GET(req: NextRequest) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY (server)' }, { status: 500 });
  }
  try {
    const res = await fetch(`${OR_BASE}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.get('origin') || 'http://localhost:3000',
        'X-Title': 'Dialogia',
      },
      cache: 'no-store',
    });
    const body = await res.text();
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
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
