import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { verifyAuthTokenEdgeWithClaims } from '@/lib/auth/edge';
import { computeSecretFingerprintEdge } from '@/lib/auth/fingerprint.edge';
import type { AuthClaims } from '@/lib/auth/types';
import { isAuthDebugRouteEnabled } from '@/lib/env/auth';
import { getServerEnv } from '@/lib/env/server';
import { getNodeEnv, isProd } from '@/lib/env/runtime';
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

    const secret = getServerEnv('AUTH_COOKIE_SECRET');
    const hasAuthSecret = !!secret;
    const secretFingerprint = await computeSecretFingerprintEdge(secret);
    const nodeEnv = getNodeEnv();
    const inProd = isProd();

    // Try to verify the token using Edge runtime (same as middleware)
    type EdgeVerification =
      | { valid: true; claims: AuthClaims }
      | { valid: false; reason: string }
      | null;
    let edgeVerification: EdgeVerification = null;
    if (authCookie?.value && secret) {
      try {
        const claims = await verifyAuthTokenEdgeWithClaims(authCookie.value, secret);
        edgeVerification = claims
          ? { valid: true, claims }
          : { valid: false, reason: 'verification_failed' };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'error';
        edgeVerification = { valid: false, reason: message };
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
