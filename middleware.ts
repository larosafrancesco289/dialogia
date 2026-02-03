import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { isProd } from '@/lib/env/runtime';
import { redirectToAccess } from '@/lib/auth/errors';
import { computeSecretFingerprintEdge } from '@/lib/auth/fingerprint.edge';
import type { AccessTier } from '@/lib/auth/types';
import { isPublicAuthPath, verifyAuthToken } from '@/lib/auth/middleware';
import {
  applyAuthDebugHeaders,
  applyAuthTimingHeaders,
  getAuthDebugConfig,
} from '@/lib/auth/middlewareDebug.edge';

export default async function middleware(req: NextRequest) {
  const { shouldLogTiming, shouldDebugHeaders, startedAt } = getAuthDebugConfig();

  const withTiming = (res: NextResponse) =>
    applyAuthTimingHeaders(res, { startedAt, shouldLogTiming });

  const withDebug = (res: NextResponse, info: Record<string, string>) =>
    applyAuthDebugHeaders(res, info, shouldDebugHeaders);

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
  if (isPublicAuthPath(pathname)) return NextResponse.next();

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

  const result = await verifyAuthToken(token, secret);
  if (!result.ok) {
    const fingerprint = await computeSecretFingerprintEdge(secret);
    const res = redirectToAccess(req);
    return withTiming(
      withDebug(res, {
        reason: result.reason,
        token_len: String(token.length),
        secret_fp: fingerprint,
      }),
    );
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
  // Next.js requires a static literal matcher here (imported constants are rejected).
  matcher: ['/((?!_next/|favicon.ico|assets|api).*)'],
};
