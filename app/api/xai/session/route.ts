import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/server/route';
import { logger } from '@/lib/logger';
import { XaiSessionRequestSchema } from '@/lib/schemas/api';
import { parseJson, route } from '@/lib/server/routeBuilder';

export const POST = route('xai-session')
  .requireTier({
    allow: ['developer'],
    message: 'Voice mode is only available for developer tier',
  })
  .requireEnv('XAI_API_KEY')
  .handler(async (request, ctx) => {
    try {
      const parsed = await parseJson(XaiSessionRequestSchema)(request);
      if (!parsed.ok) return parsed.response;
      const voice = parsed.data.voice || 'eve';
      const instructions =
        parsed.data.instructions ||
        'You are a helpful voice assistant. Be concise and natural in your responses. Keep answers brief unless the user asks for detail.';

      const response = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.env.XAI_API_KEY}`,
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
