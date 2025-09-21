import { NextRequest, NextResponse } from 'next/server';

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export async function GET(req: NextRequest) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing BRAVE_SEARCH_API_KEY' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const count = Math.min(parseInt(searchParams.get('count') || '5', 10) || 5, 10);
  if (!q.trim()) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  try {
    const url = new URL(BRAVE_ENDPOINT);
    url.searchParams.set('q', q);
    url.searchParams.set('count', String(count));
    url.searchParams.set('country', 'us');
    url.searchParams.set('safesearch', 'moderate');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      // We do not forward client IPs or other PII
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dur = Math.max(0, t1 - t0);
      return new NextResponse(JSON.stringify({ error: 'brave_error', detail: text }), {
        status: res.status,
        headers: {
          'Content-Type': 'application/json',
          'Server-Timing': `proxy;dur=${dur.toFixed(1)}`,
          'Cache-Control': 'no-store',
        },
      });
    }
    const data: any = await res.json();
    const web = data?.web?.results || [];
    const results = web.slice(0, count).map((r: any) => ({
      title: r?.title,
      url: r?.url,
      description: r?.description,
    }));
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);
    return new NextResponse(JSON.stringify({ results }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Server-Timing': `proxy;dur=${dur.toFixed(1)}`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'unknown_error' }, { status: 500 });
  }
}
