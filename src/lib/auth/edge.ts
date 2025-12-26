import { base64UrlDecode } from './shared';
import type { AccessTier, AuthClaims } from './types';

export type { AccessTier, AuthClaims };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return Uint8Array.from(view).buffer;
}

/**
 * Verify auth token in edge runtime.
 * @returns boolean for backwards compatibility
 */
export async function verifyAuthTokenEdge(token: string, secret: string): Promise<boolean> {
  const result = await verifyAuthTokenEdgeWithClaims(token, secret);
  return result !== null;
}

/**
 * Verify auth token in edge runtime and return claims if valid.
 * @returns AuthClaims if valid, null if invalid
 */
export async function verifyAuthTokenEdgeWithClaims(
  token: string,
  secret: string,
): Promise<AuthClaims | null> {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const payloadBytes = base64UrlDecode(payload);
    const signatureBytes = base64UrlDecode(signature);
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      toArrayBuffer(signatureBytes),
      toArrayBuffer(payloadBytes),
    );
    if (!valid) return null;
    const claims = JSON.parse(decoder.decode(payloadBytes)) as AuthClaims;
    if (typeof claims?.exp !== 'number') return null;
    if (Date.now() > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}
