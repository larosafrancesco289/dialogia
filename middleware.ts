import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME, PUBLIC_AUTH_PATHS } from '@/lib/auth/shared';
import { verifyAuthTokenEdgeDetailed } from '@/lib/auth/edge';
import { isProd } from '@/lib/config';
import { redirectToAccess } from '@/lib/auth/errors';
import type { AccessTier } from '@/lib/auth/types';

// Dynamic paths that remain public; static assets are excluded via the matcher.
function isPublicPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.includes(pathname);
}

export default async function middleware(req: NextRequest) {
  const shouldLogTiming = !isProd() && process.env.AUTH_TIMING_DEBUG === 'true';
  const startedAt = shouldLogTiming && typeof performance !== 'undefined' ? performance.now() : 0;
  const shouldDebugAuth = process.env.AUTH_DEBUG_HEADERS === 'true';
  // Debug notes (Vercel redirect loop, Dec 2025):
  // - /api/auth/set-free-tier returns 200 and sets dlg_access/dlg_tier.
  // - GET / sends dlg_access but receives 307 with x-auth-reason=invalid_token.
  // - /api/auth/debug (edge) verifies the same token as valid.
  // - ACCESS_COOKIE_DOMAIN unset; cookie is host-only and included on requests.
  // => Indicates middleware is running with a different secret (stale Edge build/env).

  const withTiming = (res: NextResponse) => {
    // Prevent edge caching of auth decisions so cookie changes take effect immediately.
    res.headers.set('x-middleware-cache', 'no-cache');
    if (shouldLogTiming && typeof performance !== 'undefined') {
      const duration = Math.max(0, performance.now() - startedAt);
      res.headers.set('Server-Timing', `auth;dur=${duration.toFixed(2)}`);
    }
    return res;
  };

  const withDebug = (res: NextResponse, info: Record<string, string>) => {
    if (!shouldDebugAuth) return res;
    for (const [key, value] of Object.entries(info)) {
      res.headers.set(`x-auth-${key}`, value);
    }
    return res;
  };

  // Compute secret fingerprint for debugging (first 8 chars of SHA-256 hash)
  const computeSecretFingerprint = async (s: string | undefined): Promise<string> => {
    if (!s) return 'none';
    const data = new TextEncoder().encode(s);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const { pathname } = req.nextUrl;

  // In development, bypass the access gate and auto-assign developer tier
  if (!isProd()) {
    const res = NextResponse.next();
    // Set developer tier cookie for dev mode (if not already set)
    const currentTier = req.cookies.get(TIER_COOKIE_NAME)?.value;
    if (currentTier !== 'developer') {
      res.cookies.set({
        name: TIER_COOKIE_NAME,
        value: 'developer',
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 60 * 60 * 24 * 14,
      });
    }
    return withTiming(res);
  }

  // In production, check auth
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    const res = redirectToAccess(req);
    return withTiming(withDebug(res, { reason: 'missing_cookie' }));
  }

  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!secret) {
    const res = redirectToAccess(req);
    return withTiming(withDebug(res, { reason: 'missing_secret' }));
  }

  const result = await verifyAuthTokenEdgeDetailed(token, secret);
  if (!result.ok) {
    const fingerprint = await computeSecretFingerprint(secret);
    const res = redirectToAccess(req);
    return withTiming(withDebug(res, {
      reason: result.reason,
      token_len: String(token.length),
      secret_fp: fingerprint,
    }));
  }
  const claims = result.claims;

  // Token is valid - ensure tier cookie matches claims
  const res = NextResponse.next();
  const tier: AccessTier = claims.tier || 'free';
  const currentTier = req.cookies.get(TIER_COOKIE_NAME)?.value;

  if (currentTier !== tier) {
    res.cookies.set({
      name: TIER_COOKIE_NAME,
      value: tier,
      httpOnly: false,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    });
  }

  return withTiming(res);
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|assets|api).*)'],
};
