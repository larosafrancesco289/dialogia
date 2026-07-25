import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { readRequestCookie } from '@/lib/auth/cookies.server';
import { verifyAuthTokenEdgeWithClaims } from '@/lib/auth/token.edge';
import { computeSecretFingerprintEdge } from '@/lib/auth/fingerprint.edge';
import type { AuthClaims } from '@/lib/auth/types';
import { isAuthDebugRouteEnabled } from '@/lib/env/auth';
import { getServerEnv } from '@/lib/env/server';
import { isServerProd, readServerEnvValue } from '@/lib/env/source';
import { jsonError } from '@/lib/server/route';
import { route } from '@/lib/server/routeBuilder';

export const GET = route('auth-debug').handler(async (req) => {
  const debugEnabled = !isServerProd() || isAuthDebugRouteEnabled();
  if (!debugEnabled) {
    return jsonError(404, 'not_found');
  }

  const authToken = readRequestCookie(req, AUTH_COOKIE_NAME);
  const tierCookie = readRequestCookie(req, TIER_COOKIE_NAME);

  const secret = getServerEnv('AUTH_COOKIE_SECRET');
  const hasAuthSecret = !!secret;
  const secretFingerprint = await computeSecretFingerprintEdge(secret);
  const nodeEnv = readServerEnvValue('NODE_ENV');
  const inProd = isServerProd();

  type EdgeVerification =
    | { valid: true; claims: AuthClaims }
    | { valid: false; reason: string }
    | null;
  let edgeVerification: EdgeVerification = null;
  if (authToken && secret) {
    try {
      const claims = await verifyAuthTokenEdgeWithClaims(authToken, secret);
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

  // Simulate the gate's decision
  let gateWouldAllow = false;
  if (!inProd) {
    gateWouldAllow = true; // dev mode bypasses auth
  } else if (authToken && secret) {
    gateWouldAllow = !!(await verifyAuthTokenEdgeWithClaims(authToken, secret));
  }

  return new Response(
    JSON.stringify({
      nodeEnv,
      isProd: inProd,
      gateWouldAllow,
      cookies: {
        auth: authToken ? { exists: true, length: authToken.length } : { exists: false },
        tier: tierCookie || null,
      },
      edgeVerification,
      envVars: {
        AUTH_COOKIE_SECRET: hasAuthSecret ? 'SET' : 'MISSING',
        AUTH_COOKIE_SECRET_FINGERPRINT: secretFingerprint,
      },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
