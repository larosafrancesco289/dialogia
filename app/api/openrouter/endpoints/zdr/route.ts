import { NextRequest, NextResponse } from 'next/server';

const OR_ZDR_URL = 'https://openrouter.ai/api/v1/endpoints/zdr';

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(OR_ZDR_URL, {
      headers: {
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.get('origin') || 'http://localhost:3000',
        'X-Title': 'Dialogia',
      },
      cache: 'no-store',
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'proxy_error' }, { status: 500 });
  }
}
