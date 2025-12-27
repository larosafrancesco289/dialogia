import { NextResponse } from 'next/server';
import { jsonError, requireServerEnv, withTiming } from '@/lib/server/route';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  return withTiming('xai-session', async () => {
    let apiKey: string;
    try {
      apiKey = requireServerEnv('XAI_API_KEY');
    } catch {
      return jsonError(500, 'missing_env', 'XAI_API_KEY');
    }

    try {
      const body = await request.json().catch(() => ({}));
      const voice = body.voice || 'eve';
      const instructions =
        body.instructions ||
        'You are a helpful voice assistant. Be concise and natural in your responses. Keep answers brief unless the user asks for detail.';

      const response = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expires_after: { seconds: 300 },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Failed to get ephemeral token: ${response.status} ${errorText}`);
        return jsonError(response.status, 'xai_session_error', errorText);
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
      logger.error('Error creating xAI session:', error);
      return jsonError(
        500,
        'xai_session_error',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  });
}
