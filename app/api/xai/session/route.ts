import { NextResponse } from 'next/server';

const XAI_API_KEY = process.env.XAI_API_KEY || '';

export async function POST(request: Request) {
  if (!XAI_API_KEY) {
    return NextResponse.json(
      { error: 'XAI_API_KEY not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const voice = body.voice || 'eve';
    const instructions = body.instructions || 'You are a helpful voice assistant. Be concise and natural in your responses. Keep answers brief unless the user asks for detail.';

    const response = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { seconds: 300 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to get ephemeral token: ${response.status} ${errorText}`);
      return NextResponse.json(
        { error: 'Failed to create session', details: errorText },
        { status: response.status }
      );
    }

    const data = (await response.json()) as { value: string; expires_at: number };

    return NextResponse.json({
      client_secret: {
        value: data.value,
        expires_at: data.expires_at,
      },
      voice,
      instructions,
    });
  } catch (error) {
    console.error('Error creating xAI session:', error);
    return NextResponse.json(
      {
        error: 'Failed to create session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
