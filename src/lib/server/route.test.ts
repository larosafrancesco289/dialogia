import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { jsonError } from '@/lib/server/route';
import { rateLimit } from '@/lib/server/rateLimit';

test('jsonError returns consistent payload and headers', async () => {
  const res = jsonError(400, 'bad_request', 'detail');
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, 'bad_request');
  assert.equal(body.detail, 'detail');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('rateLimit returns 429 with retry headers', async () => {
  const req = new NextRequest('https://example.com/api/test');
  const config = { limit: 1, windowMs: 1000 };
  const prefix = `test-${Date.now()}`;

  assert.equal(await rateLimit(req, prefix, config), null);
  const res = await rateLimit(req, prefix, config);
  assert.ok(res);
  if (!res) return;

  const body = await res.json();
  assert.equal(res.status, 429);
  assert.equal(body.error, 'rate_limited');
  assert.ok(res.headers.get('Retry-After'));
  assert.equal(res.headers.get('X-RateLimit-Limit'), '1');
  assert.equal(res.headers.get('X-RateLimit-Remaining'), '0');
  assert.ok(res.headers.get('X-RateLimit-Reset'));
});
