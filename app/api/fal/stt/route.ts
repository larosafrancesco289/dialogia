import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { requireFalKey, getFalKey } from '@/lib/config';

// Use Whisper model which has better audio format support (including webm)
// Options: 'fal-ai/whisper' or 'fal-ai/wizper' (faster)
const FAL_STT_ID = 'fal-ai/wizper';

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

// STT request timeout (15 seconds - increased for queue processing)
const STT_TIMEOUT_MS = 15000;

export async function POST(req: NextRequest) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  // Validate FAL_KEY is present
  const falKey = getFalKey();
  if (!falKey) {
    console.error('STT error: FAL_KEY environment variable is not set');
    return NextResponse.json(
      { error: 'FAL_KEY not configured. Please set the FAL_KEY environment variable.' },
      { status: 500 }
    );
  }

  // Configure fal client with credentials
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
      console.log('STT: Audio file too small, returning empty text');
      return NextResponse.json({ error: 'Audio file too small', text: '' }, { status: 200 });
    }

    // Use explicit MIME type from client (most reliable), fallback to blob type, then default
    const rawMime = explicitMimeType || audioFile.type || 'audio/webm';
    const mimeType = rawMime.split(';')[0].trim().toLowerCase();
    const ext = MIME_TO_EXT[mimeType] || mimeType.split(/[\/+]/)[1] || 'webm';

    console.log(`STT: Processing audio file - size: ${audioFile.size}, mime: ${mimeType}, ext: ${ext}`);

    // Wrap in a File with explicit name + type so storage keeps the extension
    const namedFile = new File([audioFile], `audio.${ext}`, { type: mimeType });

    // Upload to FAL storage to get a URL
    let audioUrl: string;
    try {
      audioUrl = await fal.storage.upload(namedFile);
      console.log(`STT: Audio uploaded to FAL storage: ${audioUrl}`);
    } catch (uploadErr) {
      console.error('STT: Failed to upload audio to FAL storage:', uploadErr);
      const uploadMsg = uploadErr instanceof Error ? uploadErr.message : 'Upload failed';
      return NextResponse.json({ error: `Audio upload failed: ${uploadMsg}` }, { status: 500 });
    }

    // Use fal.subscribe for complete audio transcription (not streaming)
    // This properly handles the queue and returns the full result
    // Using Whisper (wizper) model which supports many audio formats including webm
    let result: { data: unknown; requestId: string };
    try {
      result = await Promise.race([
        fal.subscribe(FAL_STT_ID, {
          input: {
            audio_url: audioUrl,
            task: 'transcribe',
            // chunk_level: 'segment', // Optional: can be 'segment' or 'word'
          },
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS') {
              console.log('STT: Processing in progress...');
            }
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('STT request timed out')), STT_TIMEOUT_MS)
        ),
      ]);
    } catch (subscribeErr: unknown) {
      // Log detailed error information
      console.error('STT: fal.subscribe failed:', subscribeErr);
      
      // Extract error details from fal.ai ApiError
      const errObj = subscribeErr as { message?: string; body?: unknown; status?: number };
      if (errObj.body) {
        console.error('STT: Error body:', JSON.stringify(errObj.body, null, 2));
      }
      
      const subMsg = errObj.message || 'Transcription failed';
      
      // Check if it's an authentication error
      if (subMsg.includes('401') || subMsg.includes('unauthorized') || subMsg.includes('Unauthorized')) {
        return NextResponse.json(
          { error: 'FAL_KEY is invalid or expired. Please check your API key.' },
          { status: 401 }
        );
      }
      
      // Extract more specific error from body if available
      const bodyErr = errObj.body as { detail?: string; error?: string } | undefined;
      const detailMsg = bodyErr?.detail || bodyErr?.error || subMsg;
      
      return NextResponse.json({ error: `Transcription failed: ${detailMsg}` }, { status: 500 });
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);

    console.log(`STT: Received result in ${dur.toFixed(0)}ms:`, JSON.stringify(result.data).slice(0, 200));

    // Extract text from the result - handle various response shapes
    // The fal.ai speech-to-text API returns { text: string } in result.data
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
