import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { requireFalKey } from '@/lib/config';

const FAL_STT_ENDPOINT = 'https://fal.run/fal-ai/wizper';

// Map MIME types to file extensions for FAL storage
const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};

export async function POST(req: NextRequest) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  let falKey: string;
  try {
    falKey = requireFalKey();
  } catch {
    return NextResponse.json({ error: 'Missing FAL_KEY' }, { status: 400 });
  }

  // Configure fal client
  fal.config({ credentials: falKey });

  try {
    // Get audio from form data
    const formData = await req.formData();
    const audioFile = formData.get('audio');
    const explicitMimeType = formData.get('mimeType') as string | null;

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: 'Missing audio file' }, { status: 400 });
    }

    // Use explicit MIME type from client (most reliable), fallback to blob type, then default
    const rawMime = explicitMimeType || audioFile.type || 'audio/webm';
    const mimeType = rawMime.split(';')[0].trim().toLowerCase();
    const ext = MIME_TO_EXT[mimeType] || mimeType.split(/[\/+]/)[1] || 'webm';

    // Wrap in a File with explicit name + type so storage keeps the extension
    const namedFile = new File([audioFile], `audio.${ext}`, { type: mimeType });
    try {
      Object.defineProperty(namedFile, 'name', { value: `audio.${ext}` });
    } catch {
      // Ignore if defineProperty is not allowed; File constructor already sets name
    }

    // Upload to FAL storage to get a URL
    const audioUrl = await fal.storage.upload(namedFile);

    // Call Fal.AI STT with the uploaded URL
    const response = await fetch(FAL_STT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        task: 'transcribe',
        language: 'en',
        chunk_level: 'segment',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'fal_stt_error', detail: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    const transcript = result.text || '';

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);

    // Return as SSE format for consistency with streaming interface
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Emit final transcript
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ final: transcript })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'Server-Timing': `proxy;dur=${dur.toFixed(1)}`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    console.error('STT error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
