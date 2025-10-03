import { cookies } from 'next/headers';
import crypto from 'crypto';
import { AUTH_COOKIE_NAME, base64UrlDecode, base64UrlEncode } from './shared';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
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
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
}

export function hmacCode(code: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(code, 'utf8').digest('hex');
}

export type AuthClaims = { iat: number; exp: number; sub: string };

export function createAuthToken(claims: AuthClaims): string {
  const secret = getAuthCookieSecret();
  const payload = Buffer.from(JSON.stringify(claims));
  const signature = crypto.createHmac('sha256', secret).update(payload).digest();
  return `${base64UrlEncode(payload)}.${base64UrlEncode(signature)}`;
}

export function verifyAuthToken(token: string): AuthClaims | null {
  try {
    const [payloadPart, signaturePart] = token.split('.');
    if (!payloadPart || !signaturePart) return null;
    const payloadBytes = base64UrlDecode(payloadPart);
    const signatureBytes = base64UrlDecode(signaturePart);
    const secret = getAuthCookieSecret();
    const expected = crypto.createHmac('sha256', secret).update(Buffer.from(payloadBytes)).digest();
    if (!crypto.timingSafeEqual(Buffer.from(signatureBytes), expected)) return null;
    const claims = JSON.parse(Buffer.from(payloadBytes).toString('utf8')) as AuthClaims;
    if (typeof claims?.exp !== 'number' || Date.now() > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

export { AUTH_COOKIE_NAME };

export async function getAuthCookie() {
  try {
    const jar = await cookies();
    return jar.get(AUTH_COOKIE_NAME)?.value || null;
  } catch {
    return null;
  }
}
