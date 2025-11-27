import { NextRequest, NextResponse } from 'next/server';
import { requireFalKey } from '@/lib/config';

// Use the turbo model for lower latency
const FAL_TTS_ENDPOINT = 'https://fal.run/fal-ai/minimax/speech-2.6-turbo';

type TTSRequestBody = {
  text: string;
  voiceId?: string;
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
    const { text, voiceId = 'Friendly_Person', speed = 1.0 } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Missing or empty text' }, { status: 400 });
    }

    // Call Fal.AI TTS with the speech-2.6-turbo model
    // Per docs: use "prompt" field (not "text"), and output_format: "url"
    const response = await fetch(FAL_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: text, // speech-2.6-turbo uses "prompt" not "text"
        voice_setting: {
          voice_id: voiceId,
          speed,
          vol: 1,
          pitch: 0,
          english_normalization: true, // Improve number reading
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1, // mono for voice
        },
        output_format: 'url', // Get audio URL directly
        language_boost: 'English', // Optimize for English
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'fal_tts_error', detail: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, t1 - t0);

    // Extract audio URL from response (handle different response shapes)
    const audioUrl = result.audio?.url || result.audio_url;

    if (!audioUrl) {
      console.error('TTS response missing audio URL:', result);
      return NextResponse.json(
        { error: 'No audio URL in response' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        audio: {
          url: audioUrl,
        },
        duration_ms: result.duration_ms,
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
    console.error('TTS error:', err);
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
