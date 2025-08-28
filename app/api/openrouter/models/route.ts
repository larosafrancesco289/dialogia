import { NextRequest, NextResponse } from 'next/server';

const OR_MODELS_URL = 'https://openrouter.ai/api/v1/models';

export async function GET(req: NextRequest) {
  const serverKey = process.env.OPENROUTER_API_KEY;
  if (!serverKey) {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 400 });
  }

  try {
    const res = await fetch(OR_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${serverKey}`,
        'Content-Type': 'application/json',
        // Required by OpenRouter for client apps
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

