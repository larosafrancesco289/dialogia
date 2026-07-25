import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyAccessGate } from '../functions/middleware';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { bindServerEnv } from '@/lib/env/source';
import { createAuthToken } from '@/lib/auth/token.edge';
import { installWebCryptoPolyfill } from './helpers/installWebCryptoPolyfill';

installWebCryptoPolyfill();

const serve = async () => new Response('ok', { status: 200 });

const gate = (
  path: string,
  opts: { env?: Record<string, string>; cookie?: string } = {},
): Promise<Response> => {
  bindServerEnv({ NODE_ENV: 'production', AUTH_COOKIE_SECRET: 'secret', ...opts.env });
  const req = new Request(`https://example.com${path}`, {
    headers: opts.cookie ? { cookie: opts.cookie } : undefined,
  });
  return applyAccessGate(req, serve);
};

const signToken = (exp: number, secret: string) =>
  createAuthToken({ sub: 'test', tier: 'individual', iat: Date.now(), exp }, secret);

test('gate bypasses auth checks in development mode', async () => {
  const res = await gate('/app', { env: { NODE_ENV: 'development' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie') ?? '', new RegExp(`${TIER_COOKIE_NAME}=developer`));
});

test('gate treats a missing NODE_ENV as production', async () => {
  bindServerEnv({ AUTH_COOKIE_SECRET: 'secret' });
  const res = await applyAccessGate(new Request('https://example.com/app'), serve);
  assert.equal(res.status, 307);
});

test('gate allows public paths without auth in production', async () => {
  const res = await gate('/access');
  assert.equal(res.status, 200);
});

test('gate allows static assets without auth so /access can boot', async () => {
  const res = await gate('/assets/index-abc123.js');
  assert.equal(res.status, 200);
});

test('gate redirects to /access when the cookie is missing', async () => {
  const res = await gate('/dashboard');
  assert.equal(res.status, 307);
  assert.equal(res.headers.get('location'), 'https://example.com/access');
});

test('gate redirects when the secret is missing', async () => {
  const token = await signToken(Date.now() + 10_000, 'secret');
  const res = await gate('/dashboard', {
    env: { AUTH_COOKIE_SECRET: '' },
    cookie: `${AUTH_COOKIE_NAME}=${token}`,
  });
  assert.equal(res.status, 307);
});

test('gate rejects invalid tokens', async () => {
  const tampered = `${await signToken(Date.now() + 10_000, 'different-secret')}a`;
  const res = await gate('/dashboard', { cookie: `${AUTH_COOKIE_NAME}=${tampered}` });
  assert.equal(res.status, 307);
  assert.equal(res.headers.get('location'), 'https://example.com/access');
});

test('gate allows valid tokens and syncs the tier cookie', async () => {
  const token = await signToken(Date.now() + 10_000, 'secret');
  const res = await gate('/dashboard', { cookie: `${AUTH_COOKIE_NAME}=${token}` });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie') ?? '', new RegExp(`${TIER_COOKIE_NAME}=individual`));
});

after(() => {
  bindServerEnv(undefined);
});
