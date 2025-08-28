import { NextRequest, NextResponse } from 'next/server';

const OR_RERANK_URL = 'https://openrouter.ai/api/v1/rerank';

export async function POST(req: NextRequest) {
  const serverKey = process.env.OPENROUTER_API_KEY;
  if (!serverKey) {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 400 });
  }

  try {
    const body = await req.text();
    const res = await fetch(OR_RERANK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.get('origin') || 'http://localhost:3000',
        'X-Title': 'Dialogia',
      },
      body,
      cache: 'no-store',
    });
    return new Response(res.body, {
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

