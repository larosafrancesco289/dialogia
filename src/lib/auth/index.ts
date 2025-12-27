import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { AUTH_COOKIE_NAME, base64UrlDecode, base64UrlEncode } from './shared';
import {
  getAccessCodePepper,
  getAuthCookieSecret,
  getDeveloperCodeHashes,
  getIndividualCodeHashes,
  hasTieredCodesConfigured,
} from '@/lib/env/server';
import type { AccessTier, AuthClaims, CodeType } from './types';

export type { AccessTier, AuthClaims, CodeType };

export {
  getAccessCodePepper,
  getAuthCookieSecret,
  getDeveloperCodeHashes,
  getIndividualCodeHashes,
  hasTieredCodesConfigured,
};

export function hmacCode(code: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(code, 'utf8').digest('hex');
}

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
