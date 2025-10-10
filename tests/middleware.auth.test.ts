import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import middleware from '../middleware';
import { AUTH_COOKIE_NAME } from '@/lib/auth/shared';
import { webcrypto } from 'node:crypto';

if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_SECRET = process.env.AUTH_COOKIE_SECRET;

const setEnv = (key: string, value: string | undefined) => {
  Reflect.set(process.env, key, value);
};

const createRequest = (path: string, cookie?: string) =>
  new NextRequest(`https://example.com${path}`, cookie ? { headers: { cookie } } : undefined);

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
  const encode = (bytes: Uint8Array) =>
    Buffer.from(bytes).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode(payloadBytes)}.${encode(new Uint8Array(signature))}`;
};

test('middleware bypasses auth checks in development mode', async () => {
  setEnv('NODE_ENV', 'development');
  const req = createRequest('/app');
  const res = await middleware(req as any);
  assert.equal(res.status, 200);
});

test('middleware allows public paths without auth in production', async () => {
  setEnv('NODE_ENV', 'production');
  setEnv('AUTH_COOKIE_SECRET', 'secret');
  const req = createRequest('/access');
  const res = await middleware(req as any);
  assert.equal(res.status, 200);
});

test('middleware redirects to /access when cookie missing', async () => {
  setEnv('NODE_ENV', 'production');
  setEnv('AUTH_COOKIE_SECRET', 'secret');
  const req = createRequest('/dashboard');
  const res = await middleware(req as any);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get('location'), 'https://example.com/access');
});

test('middleware rejects invalid tokens', async () => {
  setEnv('NODE_ENV', 'production');
  setEnv('AUTH_COOKIE_SECRET', 'secret');
  const tampered = `${await signToken({ exp: Date.now() + 10_000 }, 'different-secret')}a`;
  const req = createRequest('/dashboard', `${AUTH_COOKIE_NAME}=${tampered}`);
  const res = await middleware(req as any);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get('location'), 'https://example.com/access');
});

test('middleware allows valid tokens', async () => {
  setEnv('NODE_ENV', 'production');
  setEnv('AUTH_COOKIE_SECRET', 'secret');
  const token = await signToken({ exp: Date.now() + 10_000 }, 'secret');
  const req = createRequest('/dashboard', `${AUTH_COOKIE_NAME}=${token}`);
  const res = await middleware(req as any);
  assert.equal(res.status, 200);
});

after(() => {
  setEnv('NODE_ENV', ORIGINAL_ENV);
  setEnv('AUTH_COOKIE_SECRET', ORIGINAL_SECRET);
});
