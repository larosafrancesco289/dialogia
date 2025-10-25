import { NextRequest, NextResponse } from 'next/server';
import { requireServerAnthropicKey } from '@/lib/config';
import { anthropicFetchModels } from '@/lib/api/anthropicClient';

export async function GET(req: NextRequest) {
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
    const res = await anthropicFetchModels(apiKey, { origin: req.headers.get('origin') || undefined });
    const body = await res.text();
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
        'Server-Timing': `anthropic-proxy;dur=${dur.toFixed(1)}`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'anthropic_proxy_error' }, { status: 500 });
  }
}
