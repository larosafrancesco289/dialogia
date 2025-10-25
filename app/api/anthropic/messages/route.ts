import { NextRequest, NextResponse } from 'next/server';
import { requireServerAnthropicKey } from '@/lib/config';
import { anthropicMessages } from '@/lib/api/anthropicClient';

export async function POST(req: NextRequest) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const headerKey = req.headers.get('x-api-key') || undefined;
  let apiKey = headerKey;
  if (!apiKey) {
    try {
      apiKey = requireServerAnthropicKey();
    } catch {
      apiKey = undefined;
    }
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing Anthropics API key' },
      {
        status: 500,
      },
    );
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
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Server-Timing': `anthropic-proxy;dur=${dur.toFixed(1)}`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'anthropic_proxy_error' }, { status: 500 });
  }
}
