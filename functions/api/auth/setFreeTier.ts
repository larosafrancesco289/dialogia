import type { AuthClaims } from '@/lib/auth/types';
import { createAuthToken } from '@/lib/auth/token.edge';
import { buildAuthCookies, withSetCookies } from '@/lib/auth/cookies.server';
import { computeSecretFingerprintEdge } from '@/lib/auth/fingerprint.edge';
import { getAuthCookieSecret } from '@/lib/env/server';
import { jsonError } from '@/lib/server/route';
import { logger } from '@/lib/logger';
import { isServerProd } from '@/lib/env/source';
import { RATE_LIMITS } from '@/lib/server/rateLimit';
import { route } from '@/lib/server/routeBuilder';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;

/**
 * Sets the free tier for users who want to access without a code.
 * Creates an auth token with tier='free' which limits access to free models only.
 */
export const POST = route('auth-set-free-tier')
  .rateLimit('auth-free', RATE_LIMITS.AUTH_STRICT)
  .handler(async () => {
    try {
      const now = Date.now();
      const claims: AuthClaims = {
        sub: 'free:anonymous',
        tier: 'free',
        iat: now,
        exp: now + TOKEN_TTL_MS,
      };

      // Ensure secret is present (throws if missing)
      const secret = getAuthCookieSecret();
      const token = await createAuthToken(claims, secret);
      const inProd = isServerProd();
      const responseBody = inProd
        ? { ok: true, tier: 'free' }
        : { ok: true, tier: 'free', secretFp: await computeSecretFingerprintEdge(secret) };

      const res = new Response(JSON.stringify(responseBody), {
        headers: { 'Content-Type': 'application/json' },
      });
      return withSetCookies(res, buildAuthCookies({ token, tier: 'free', secure: inProd }));
    } catch (e: unknown) {
      logger.error('[set-free-tier] Error:', e);
      const message = e instanceof Error ? e.message : 'internal_error';
      if (message.startsWith('missing_env:')) {
        return jsonError(500, 'missing_env', message.replace('missing_env:', ''));
      }
      return jsonError(500, 'internal_error');
    }
  });
