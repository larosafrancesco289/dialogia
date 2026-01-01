import { NextResponse } from 'next/server';
import { AuthClaims, createAuthToken, getAuthCookieSecret } from '@/lib/auth';
import { setAuthCookies } from '@/lib/auth/cookies.server';
import { computeSecretFingerprintNode } from '@/lib/auth/fingerprint.node';
import { jsonError } from '@/lib/server/route';
import { logger } from '@/lib/logger';
import { isProd } from '@/lib/env/runtime';
import { RATE_LIMITS } from '@/lib/server/rateLimit';
import { route } from '@/lib/server/routeBuilder';

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
        exp: now + 1000 * 60 * 60 * 24 * 14, // 14 days
      };

      // Ensure secret is present (throws if missing)
      const secret = getAuthCookieSecret();
      const token = createAuthToken(claims);
      const secretFp = computeSecretFingerprintNode(secret);
      const inProd = isProd();
      const responseBody = inProd
        ? { ok: true, tier: 'free' }
        : { ok: true, tier: 'free', secretFp };

      const res = NextResponse.json(responseBody);
      setAuthCookies(res, { token, tier: 'free', secure: inProd });

      return res;
    } catch (e: unknown) {
      logger.error('[set-free-tier] Error:', e);
      const message = e instanceof Error ? e.message : 'internal_error';
      if (message.startsWith('missing_env:')) {
        return jsonError(500, 'missing_env', message.replace('missing_env:', ''));
      }
      return jsonError(500, 'internal_error');
    }
  });
