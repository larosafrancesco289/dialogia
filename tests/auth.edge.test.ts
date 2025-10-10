import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifyAuthTokenEdge } from '@/lib/auth/edge';
import { base64UrlEncode } from '@/lib/auth/shared';

if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}

const encoder = new TextEncoder();

const signToken = async (payload: Record<string, unknown>, secret: string) => {
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
  const payloadPart = base64UrlEncode(payloadBytes);
  const signaturePart = base64UrlEncode(new Uint8Array(signature));
  return `${payloadPart}.${signaturePart}`;
};

test('verifyAuthTokenEdge returns true for valid tokens', async () => {
  const token = await signToken({ exp: Date.now() + 10_000 }, 'secret');
  const result = await verifyAuthTokenEdge(token, 'secret');
  assert.equal(result, true);
});

test('verifyAuthTokenEdge rejects expired tokens', async () => {
  const token = await signToken({ exp: Date.now() - 10 }, 'secret');
  const result = await verifyAuthTokenEdge(token, 'secret');
  assert.equal(result, false);
});

test('verifyAuthTokenEdge rejects malformed tokens', async () => {
  const result = await verifyAuthTokenEdge('not-a-token', 'secret');
  assert.equal(result, false);
});

test('verifyAuthTokenEdge rejects invalid signatures', async () => {
  const token = await signToken({ exp: Date.now() + 10_000 }, 'secret');
  const tampered = `${token}a`;
  const result = await verifyAuthTokenEdge(tampered, 'secret');
  assert.equal(result, false);
});
