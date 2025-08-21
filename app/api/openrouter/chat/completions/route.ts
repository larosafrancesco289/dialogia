import { NextRequest, NextResponse } from 'next/server';

const OR_BASE = 'https://openrouter.ai/api/v1';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY (server)' }, { status: 500 });
  }
  try {
    const body = await req.text();
    const res = await fetch(`${OR_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.get('origin') || 'http://localhost:3000',
        'X-Title': 'Dialogia',
      },
      body,
    });
    // Pass through streaming or JSON response as-is
    const contentType = res.headers.get('content-type') || 'application/json';
    return new Response(res.body, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'proxy_error' }, { status: 500 });
  }
}
