import { NextRequest, NextResponse } from 'next/server';
import { requireFalKey } from '@/lib/config';

const FAL_TTS_ENDPOINT = 'https://fal.run/fal-ai/minimax/speech-02-hd';

type TTSRequestBody = {
  text: string;
  voice_id?: string;
  speed?: number;
};

export async function POST(req: NextRequest) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  let falKey: string;
  try {
    falKey = requireFalKey();
  } catch {
    return NextResponse.json({ error: 'Missing FAL_KEY' }, { status: 400 });
  }

  try {
    const body: TTSRequestBody = await req.json();
    const { text, voice_id = 'Friendly_Person', speed = 1.0 } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Missing or empty text' }, { status: 400 });
    }

    // Call Fal.AI TTS
    const response = await fetch(FAL_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_setting: {
          voice_id,
          speed,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'fal_tts_error', detail: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);

    return new NextResponse(
      JSON.stringify({
        audio: {
          url: result.audio_url || result.audio?.url,
        },
        duration_ms: result.duration_ms,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Server-Timing': `proxy;dur=${dur.toFixed(1)}`,
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
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
