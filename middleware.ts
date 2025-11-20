import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, PUBLIC_AUTH_PATHS, AUTH_MIDDLEWARE_MATCHER } from '@/lib/auth/shared';
import { verifyAuthTokenEdge } from '@/lib/auth/edge';
import { isProd } from '@/lib/config';
import { redirectToAccess } from '@/lib/auth/errors';

// Dynamic paths that remain public; static assets are excluded via the matcher.
function isPublicPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.includes(pathname);
}

async function verifyToken(token: string): Promise<boolean> {
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!secret) return false;
  return verifyAuthTokenEdge(token, secret);
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
  // In development, bypass the access gate entirely for easier local work
  if (!isProd()) {
    return withTiming(NextResponse.next());
  }
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return withTiming(redirectToAccess(req));
  }

  const valid = await verifyToken(token);
  if (!valid) {
    return withTiming(redirectToAccess(req));
  }
  return withTiming(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|assets|api).*)'],
};
