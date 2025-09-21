import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'dlg_access';

// URLs that do not require auth
const PUBLIC_PATHS = [
  '/access',
  '/api/auth/verify-code',
  '/api/auth/logout',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
];

// Prefixes that are always public
const PUBLIC_PREFIXES = ['/assets', '/_next', '/public'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : '';
  const str = atob(b64 + pad);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.AUTH_COOKIE_SECRET;
    if (!secret) return false;
    const [p, s] = token.split('.');
    if (!p || !s) return false;
    const payloadBytes = b64urlToBytes(p);
    const sigBytes = b64urlToBytes(s);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    // Cast to BufferSource to satisfy TS dom lib generics across versions
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      payloadBytes as unknown as BufferSource,
    );
    if (!ok) return false;
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (typeof claims?.exp !== 'number') return false;
    if (Date.now() > claims.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // In development, bypass the access gate entirely for easier local work
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.next();
  }
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
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
  // Run on almost all routes; we explicitly allowlist in-code too
  // Skip all API routes entirely to avoid any interference with auth endpoints
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets|public|api).*)'],
};
