import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import type { AccessTier } from '@/lib/auth/types';
import { getAccessCookieDomain } from '@/lib/env/server';
import { isProd } from '@/lib/env/runtime';

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 14;

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  if (!header) return jar;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    jar[name] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return jar;
}

export function readRequestCookie(req: Request, name: string): string | undefined {
  return parseCookieHeader(req.headers.get('cookie'))[name];
}

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  domain?: string;
  maxAge?: number;
  path?: string;
  sameSite?: 'lax' | 'strict' | 'none';
};

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  parts.push(`SameSite=${capitalize(options.sameSite ?? 'lax')}`);
  if (options.secure) parts.push('Secure');
  if (options.httpOnly) parts.push('HttpOnly');
  return parts.join('; ');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The session pair: the signed token stays HttpOnly, the tier is readable by
 * the client so the UI can gate features without a round trip.
 */
export function buildAuthCookies(options: {
  token: string;
  tier: AccessTier;
  maxAge?: number;
  secure?: boolean;
  domain?: string;
}): string[] {
  const shared: CookieOptions = {
    sameSite: 'lax',
    secure: options.secure ?? isProd(),
    domain: options.domain ?? getAccessCookieDomain(),
    path: '/',
    maxAge: options.maxAge ?? DEFAULT_MAX_AGE,
  };

  return [
    serializeCookie(AUTH_COOKIE_NAME, options.token, { ...shared, httpOnly: true }),
    serializeCookie(TIER_COOKIE_NAME, options.tier, { ...shared, httpOnly: false }),
  ];
}

export function withSetCookies(res: Response, cookies: string[]): Response {
  const headers = new Headers(res.headers);
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
