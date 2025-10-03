import { base64UrlDecode } from './shared';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return Uint8Array.from(view).buffer;
}

export async function verifyAuthTokenEdge(token: string, secret: string): Promise<boolean> {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
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
    if (!valid) return false;
    const claims = JSON.parse(decoder.decode(payloadBytes));
    if (typeof claims?.exp !== 'number') return false;
    return Date.now() <= claims.exp;
  } catch {
    return false;
  }
}
