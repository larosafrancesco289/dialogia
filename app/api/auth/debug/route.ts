import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { verifyAuthTokenEdgeWithClaims } from '@/lib/auth/edge';

// Force Edge runtime to match middleware
export const runtime = 'edge';

// Compute secret fingerprint for debugging (first 8 chars of SHA-256 hash)
async function computeSecretFingerprint(s: string | undefined): Promise<string> {
  if (!s) return 'none';
  const data = new TextEncoder().encode(s);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function GET(req: NextRequest) {
  const authCookie = req.cookies.get(AUTH_COOKIE_NAME);
  const tierCookie = req.cookies.get(TIER_COOKIE_NAME);

  const secret = process.env.AUTH_COOKIE_SECRET;
  const hasAuthSecret = !!secret;
  const secretFingerprint = await computeSecretFingerprint(secret);
  const nodeEnv = process.env.NODE_ENV;
  const isProd = nodeEnv?.toLowerCase() === 'production';

  // Try to verify the token using Edge runtime (same as middleware)
  let edgeVerification: any = null;
  if (authCookie?.value && secret) {
    try {
      const claims = await verifyAuthTokenEdgeWithClaims(authCookie.value, secret);
      edgeVerification = claims ? { valid: true, claims } : { valid: false, reason: 'verification_failed' };
    } catch (e: any) {
      edgeVerification = { valid: false, reason: e?.message || 'error' };
    }
  } else if (!secret) {
    edgeVerification = { valid: false, reason: 'no_secret_in_edge' };
  }

  // Simulate middleware decision
  let middlewareWouldAllow = false;
  if (!isProd) {
    middlewareWouldAllow = true; // dev mode bypasses auth
  } else if (authCookie?.value && secret) {
    const claims = await verifyAuthTokenEdgeWithClaims(authCookie.value, secret);
    middlewareWouldAllow = !!claims;
  }

  return NextResponse.json({
    nodeEnv,
    isProd,
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
}
