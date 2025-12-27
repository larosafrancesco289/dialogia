import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, AuthClaims, createAuthToken, getAuthCookieSecret } from '@/lib/auth';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { getAccessCookieDomain } from '@/lib/config';
import { computeSecretFingerprintNode } from '@/lib/auth/fingerprint.node';
import { jsonError, withTiming } from '@/lib/server/route';
import { logger } from '@/lib/logger';

/**
 * Sets the free tier for users who want to access without a code.
 * Creates an auth token with tier='free' which limits access to free models only.
 */
export async function POST(_req: NextRequest) {
  return withTiming('auth-set-free-tier', async () => {
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
      const isProd = process.env.NODE_ENV === 'production';
      const responseBody = isProd
        ? { ok: true, tier: 'free' }
        : { ok: true, tier: 'free', secretFp };

      const res = NextResponse.json(responseBody);
      const secure = process.env.NODE_ENV === 'production';
      const domain = getAccessCookieDomain();
      const maxAge = 60 * 60 * 24 * 14; // 14 days

      // Set the auth token (httpOnly)
      res.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure,
        domain,
        path: '/',
        maxAge,
      });

      // Set the tier cookie (readable by client)
      res.cookies.set({
        name: TIER_COOKIE_NAME,
        value: 'free',
        httpOnly: false,
        sameSite: 'lax',
        secure,
        domain,
        path: '/',
        maxAge,
      });

      return res;
    } catch (e: unknown) {
      logger.error('[set-free-tier] Error:', e);
      const message = e instanceof Error ? e.message : 'internal_error';
      if (message.includes('Missing env')) {
        return jsonError(500, 'missing_env', message.replace('Missing env: ', ''));
      }
      return jsonError(500, 'internal_error');
    }
  });
}
