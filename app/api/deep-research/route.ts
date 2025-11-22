import { NextRequest, NextResponse } from 'next/server';
import { deepResearch } from '@/lib/deepResearch';
import { getBraveSearchKey, requireServerOpenRouterKey } from '@/lib/config';
import { ProviderSort } from '@/lib/models/providerSort';

export async function POST(req: NextRequest) {
  let apiKey: string;
  try {
    apiKey = requireServerOpenRouterKey();
  } catch {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 500 });
  }
  const braveKey = getBraveSearchKey();
  if (!braveKey)
    return NextResponse.json({ error: 'Missing BRAVE_SEARCH_API_KEY' }, { status: 500 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const task = String(body?.task || '').trim();
  const model = String(body?.model || '').trim();
  if (!task) return NextResponse.json({ error: 'Missing task' }, { status: 400 });
  if (!model) return NextResponse.json({ error: 'Missing model' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const rawProviderSort = body?.providerSort;
        const providerSort =
          rawProviderSort === ProviderSort.Price || rawProviderSort === ProviderSort.Throughput
            ? (rawProviderSort as ProviderSort)
            : undefined;

        const result = await deepResearch({
          apiKey,
          task,
          model,
          audience: typeof body?.audience === 'string' ? body.audience : undefined,
          style: body?.style,
          cite: body?.cite,
          maxIterations: typeof body?.maxIterations === 'number' ? body.maxIterations : undefined,
          providerSort,
          onProgress: (event) => {
            const chunk = JSON.stringify({ type: 'trace', data: event }) + '\n';
            controller.enqueue(encoder.encode(chunk));
          },
        });

        const chunk = JSON.stringify({ type: 'result', data: result }) + '\n';
        controller.enqueue(encoder.encode(chunk));
        controller.close();
      } catch (e: any) {
        const msg = String(e?.message || 'deep_research_error');
        // If it's a known client error, we might want to communicate that differently,
        // but for a stream, we just send an error event.
        const chunk = JSON.stringify({ type: 'error', error: msg }) + '\n';
        controller.enqueue(encoder.encode(chunk));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
