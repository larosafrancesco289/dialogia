import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { requireFalKey } from '@/lib/config';

const FAL_STT_ID = 'fal-ai/speech-to-text/turbo/stream';

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

// STT request timeout (10 seconds)
const STT_TIMEOUT_MS = 10000;

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

    // Reject tiny audio files (likely empty/silent)
    if (audioFile.size < 1000) {
      return NextResponse.json({ error: 'Audio file too small', text: '' }, { status: 200 });
    }

    // Use explicit MIME type from client (most reliable), fallback to blob type, then default
    const rawMime = explicitMimeType || audioFile.type || 'audio/webm';
    const mimeType = rawMime.split(';')[0].trim().toLowerCase();
    const ext = MIME_TO_EXT[mimeType] || mimeType.split(/[\/+]/)[1] || 'webm';

    // Wrap in a File with explicit name + type so storage keeps the extension
    const namedFile = new File([audioFile], `audio.${ext}`, { type: mimeType });

    // Upload to FAL storage to get a URL
    const audioUrl = await fal.storage.upload(namedFile);

    // Use fal.subscribe for complete audio transcription (not streaming)
    // This properly handles the queue and returns the full result
    const result = await Promise.race([
      fal.subscribe(FAL_STT_ID, {
        input: {
          audio_url: audioUrl,
          use_pnc: true, // Enable punctuation and capitalization
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('STT request timed out')), STT_TIMEOUT_MS)
      ),
    ]);

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);

    // Extract text from the result - handle various response shapes
    const data = result.data as Record<string, unknown>;
    const text =
      (data?.text as string) ||
      (data?.transcript as string) ||
      (data?.transcription as string) ||
      '';

    return NextResponse.json(
      {
        text: text.trim(),
        requestId: result.requestId,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Server-Timing': `proxy;dur=${dur.toFixed(1)}`,
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    console.error('STT error:', err);

    // Return empty text for timeout/network errors (allow graceful recovery)
    if (message.includes('timed out') || message.includes('network')) {
      return NextResponse.json({ error: message, text: '' }, { status: 200 });
    }

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
