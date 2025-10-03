import { NextRequest, NextResponse } from 'next/server';
import { deepResearch } from '@/lib/deepResearch';
import { getBraveSearchKey, requireServerOpenRouterKey } from '@/lib/config';

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

  try {
    const result = await deepResearch({
      apiKey,
      task,
      model,
      audience: typeof body?.audience === 'string' ? body.audience : undefined,
      style: body?.style,
      cite: body?.cite,
      maxIterations: typeof body?.maxIterations === 'number' ? body.maxIterations : undefined,
      providerSort: body?.providerSort,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    const msg = String(e?.message || 'deep_research_error');
    const status = msg === 'reasoning_model_required' ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
