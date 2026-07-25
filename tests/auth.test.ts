import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWebCryptoPolyfill } from './helpers/installWebCryptoPolyfill';
import { createAuthToken, hmacHex, verifyAuthTokenEdge } from '@/lib/auth/token.edge';

installWebCryptoPolyfill();

test('auth tokens round-trip through the WebCrypto helpers', async () => {
  const now = Date.now();
  const claims = { iat: now, exp: now + 60_000, sub: 'user-123', tier: 'developer' as const };
  const token = await createAuthToken(claims, 'test-secret');
  assert.equal(await verifyAuthTokenEdge(token, 'test-secret'), true);
});

test('auth token verifier rejects a token signed with another secret', async () => {
  const claims = {
    iat: Date.now(),
    exp: Date.now() + 60_000,
    sub: 'user-abc',
    tier: 'individual' as const,
  };
  const token = await createAuthToken(claims, 'test-secret');
  assert.equal(await verifyAuthTokenEdge(token, 'other-secret'), false);
});

test('hmacHex is stable and key dependent', async () => {
  const first = await hmacHex('code-123', 'pepper');
  assert.equal(first, await hmacHex('code-123', 'pepper'));
  assert.notEqual(first, await hmacHex('code-123', 'other-pepper'));
  assert.match(first, /^[0-9a-f]{64}$/);
});
