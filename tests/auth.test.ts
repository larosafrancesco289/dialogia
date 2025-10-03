import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthToken, verifyAuthToken } from '@/lib/auth';
import { verifyAuthTokenEdge } from '@/lib/auth/edge';

test('auth token verifies across node and edge helpers', async () => {
  const previous = process.env.AUTH_COOKIE_SECRET;
  process.env.AUTH_COOKIE_SECRET = 'test-secret';
  const now = Date.now();
  const claims = { iat: now, exp: now + 60_000, sub: 'user-123' };
  const token = createAuthToken(claims);
  const nodeClaims = verifyAuthToken(token);
  assert.ok(nodeClaims);
  assert.equal(nodeClaims?.sub, claims.sub);
  assert.equal(nodeClaims?.exp, claims.exp);
  assert.equal(await verifyAuthTokenEdge(token, 'test-secret'), true);
  if (previous === undefined) delete process.env.AUTH_COOKIE_SECRET;
  else process.env.AUTH_COOKIE_SECRET = previous;
});

test('auth token edge verifier rejects invalid signature', async () => {
  const previous = process.env.AUTH_COOKIE_SECRET;
  process.env.AUTH_COOKIE_SECRET = 'test-secret';
  const claims = { iat: Date.now(), exp: Date.now() + 60_000, sub: 'user-abc' };
  const token = createAuthToken(claims);
  assert.equal(await verifyAuthTokenEdge(token, 'other-secret'), false);
  if (previous === undefined) delete process.env.AUTH_COOKIE_SECRET;
  else process.env.AUTH_COOKIE_SECRET = previous;
});
