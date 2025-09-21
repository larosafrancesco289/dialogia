import { cookies } from 'next/headers';
import crypto from 'crypto';

// Environment helpers
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function getAccessCodePepper(): string {
  return requireEnv('ACCESS_CODE_PEPPER');
}

export function getAuthCookieSecret(): string {
  return requireEnv('AUTH_COOKIE_SECRET');
}

export function getAccessCodeHashes(): string[] {
  const raw = process.env.ACCESS_CODES_HASHED || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase()); // enforce hex lowercase
}

// Hash a plaintext code with pepper using HMAC-SHA256, returning hex string
export function hmacCode(code: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(code, 'utf8').digest('hex');
}

// Auth token helpers: compact HMAC-signed token
export type AuthClaims = { iat: number; exp: number; sub: string };

function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function createAuthToken(claims: AuthClaims): string {
  const secret = getAuthCookieSecret();
  const payload = Buffer.from(JSON.stringify(claims));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest();
  return `${base64url(payload)}.${base64url(sig)}`;
}

export function verifyAuthToken(token: string): AuthClaims | null {
  try {
    const [p, s] = token.split('.');
    if (!p || !s) return null;
    const payload = Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const secret = getAuthCookieSecret();
    const expected = crypto.createHmac('sha256', secret).update(payload).digest();
    if (!crypto.timingSafeEqual(sig, expected)) return null;
    const claims = JSON.parse(payload.toString('utf8')) as AuthClaims;
    if (typeof claims?.exp !== 'number' || Date.now() > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

export const AUTH_COOKIE_NAME = 'dlg_access';

export async function getAuthCookie() {
  try {
    const jar = await cookies();
    return jar.get(AUTH_COOKIE_NAME)?.value || null;
  } catch {
    return null;
  }
}
