import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { verifyAuthTokenEdgeWithClaims } from '@/lib/auth/edge';
import { computeSecretFingerprintEdge } from '@/lib/auth/fingerprint.edge';
import { isAuthDebugRouteEnabled, isProd } from '@/lib/config';
import { jsonError, withTiming } from '@/lib/server/route';

// Force Edge runtime to match middleware
export const runtime = 'edge';

export async function GET(req: NextRequest) {
  return withTiming('auth-debug', async () => {
    const debugEnabled = !isProd() || isAuthDebugRouteEnabled();
    if (!debugEnabled) {
      return jsonError(404, 'not_found');
    }

    const authCookie = req.cookies.get(AUTH_COOKIE_NAME);
    const tierCookie = req.cookies.get(TIER_COOKIE_NAME);

    const secret = process.env.AUTH_COOKIE_SECRET;
    const hasAuthSecret = !!secret;
    const secretFingerprint = await computeSecretFingerprintEdge(secret);
    const nodeEnv = process.env.NODE_ENV;
    const inProd = isProd();

    // Try to verify the token using Edge runtime (same as middleware)
    let edgeVerification: any = null;
    if (authCookie?.value && secret) {
      try {
        const claims = await verifyAuthTokenEdgeWithClaims(authCookie.value, secret);
        edgeVerification = claims
          ? { valid: true, claims }
          : { valid: false, reason: 'verification_failed' };
      } catch (e: any) {
        edgeVerification = { valid: false, reason: e?.message || 'error' };
      }
    } else if (!secret) {
      edgeVerification = { valid: false, reason: 'no_secret_in_edge' };
    }

    // Simulate middleware decision
    let middlewareWouldAllow = false;
    if (!inProd) {
      middlewareWouldAllow = true; // dev mode bypasses auth
    } else if (authCookie?.value && secret) {
      const claims = await verifyAuthTokenEdgeWithClaims(authCookie.value, secret);
      middlewareWouldAllow = !!claims;
    }

    return NextResponse.json({
      nodeEnv,
      isProd: inProd,
      middlewareWouldAllow,
      cookies: {
        auth: authCookie ? { exists: true, length: authCookie.value.length } : { exists: false },
        tier: tierCookie?.value || null,
      },
      edgeVerification,
      envVars: {
        AUTH_COOKIE_SECRET: hasAuthSecret ? 'SET' : 'MISSING',
        AUTH_COOKIE_SECRET_FINGERPRINT: secretFingerprint,
      },
    });
  });
}
