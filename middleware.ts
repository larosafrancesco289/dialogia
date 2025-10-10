import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, PUBLIC_AUTH_PATHS, AUTH_MIDDLEWARE_MATCHER } from '@/lib/auth/shared';
import { verifyAuthTokenEdge } from '@/lib/auth/edge';
import { isProd } from '@/lib/config';

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
  const { pathname } = req.nextUrl;
  // In development, bypass the access gate entirely for easier local work
  if (!isProd()) {
    return NextResponse.next();
  }
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/access';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const valid = await verifyToken(token);
  if (!valid) {
    const url = req.nextUrl.clone();
    url.pathname = '/access';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: AUTH_MIDDLEWARE_MATCHER,
};
