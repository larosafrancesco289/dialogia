import { base64UrlDecode } from './shared';
import type { AccessTier, AuthClaims } from './types';

export type { AccessTier, AuthClaims };

const encoder = new TextEncoder();
const decoder = new TextDecoder();


/**
 * Verify auth token in edge runtime.
 * @returns boolean for backwards compatibility
 */
export async function verifyAuthTokenEdge(token: string, secret: string): Promise<boolean> {
  const result = await verifyAuthTokenEdgeWithClaims(token, secret);
  return result !== null;
}

export type VerifyResult =
  | { ok: true; claims: AuthClaims }
  | { ok: false; reason: string };

/**
 * Verify auth token in edge runtime and return claims if valid.
 * @returns AuthClaims if valid, null if invalid
 */
export async function verifyAuthTokenEdgeWithClaims(
  token: string,
  secret: string,
): Promise<AuthClaims | null> {
  const result = await verifyAuthTokenEdgeDetailed(token, secret);
  return result.ok ? result.claims : null;
}

/**
 * Detailed verification with error reasons for debugging.
 */
export async function verifyAuthTokenEdgeDetailed(
  token: string,
  secret: string,
): Promise<VerifyResult> {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) {
      return { ok: false, reason: 'missing_parts' };
    }
    const payloadBytes = base64UrlDecode(payload);
    const signatureBytes = base64UrlDecode(signature);
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    // Create fresh Uint8Arrays with dedicated ArrayBuffers for SubtleCrypto
    const sigBuffer = new Uint8Array(signatureBytes);
    const payloadBuffer = new Uint8Array(payloadBytes);
    const valid = await crypto.subtle.verify('HMAC', key, sigBuffer, payloadBuffer);
    if (!valid) {
      return { ok: false, reason: 'sig_mismatch' };
    }
    const claims = JSON.parse(decoder.decode(payloadBytes)) as AuthClaims;
    if (typeof claims?.exp !== 'number') {
      return { ok: false, reason: 'no_exp' };
    }
    if (Date.now() > claims.exp) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, claims };
  } catch (e: any) {
    return { ok: false, reason: `error:${e?.message || 'unknown'}` };
  }
}
