import { base64UrlDecode, base64UrlEncode } from './shared';
import type { AccessTier, AuthClaims } from './types';

export type { AccessTier, AuthClaims };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function importHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** HMAC-SHA256 of `value` under `key`, hex encoded. Used for access codes. */
export async function hmacHex(value: string, key: string): Promise<string> {
  const cryptoKey = await importHmacKey(key, 'sign');
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
  return toHex(new Uint8Array(signature));
}

/** Mints the session token the middleware verifies. */
export async function createAuthToken(claims: AuthClaims, secret: string): Promise<string> {
  const payloadBytes = encoder.encode(JSON.stringify(claims));
  const key = await importHmacKey(secret, 'sign');
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verify auth token in edge runtime.
 * @returns boolean for backwards compatibility
 */
export async function verifyAuthTokenEdge(token: string, secret: string): Promise<boolean> {
  const result = await verifyAuthTokenEdgeWithClaims(token, secret);
  return result !== null;
}

export type VerifyResult = { ok: true; claims: AuthClaims } | { ok: false; reason: string };

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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown';
    return { ok: false, reason: `error:${message}` };
  }
}
