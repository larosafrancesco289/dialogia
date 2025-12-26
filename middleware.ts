import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME, PUBLIC_AUTH_PATHS } from '@/lib/auth/shared';
import { verifyAuthTokenEdgeWithClaims } from '@/lib/auth/edge';
import { isProd } from '@/lib/config';
import { redirectToAccess } from '@/lib/auth/errors';
import type { AccessTier } from '@/lib/auth/types';

// Dynamic paths that remain public; static assets are excluded via the matcher.
function isPublicPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.includes(pathname);
}

async function verifyTokenWithClaims(token: string) {
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!secret) return null;
  return verifyAuthTokenEdgeWithClaims(token, secret);
}

export default async function middleware(req: NextRequest) {
  const shouldLogTiming = !isProd() && process.env.AUTH_TIMING_DEBUG === 'true';
  const startedAt = shouldLogTiming && typeof performance !== 'undefined' ? performance.now() : 0;

  const withTiming = (res: NextResponse) => {
    if (shouldLogTiming && typeof performance !== 'undefined') {
      const duration = Math.max(0, performance.now() - startedAt);
      res.headers.set('Server-Timing', `auth;dur=${duration.toFixed(2)}`);
    }
    return res;
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
    return withTiming(redirectToAccess(req));
  }

  const claims = await verifyTokenWithClaims(token);
  if (!claims) {
    return withTiming(redirectToAccess(req));
  }

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
