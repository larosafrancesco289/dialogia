import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { jsonError } from '@/lib/server/route';
import { jsonAuthError } from '@/lib/auth/errors';
import { route } from '@/lib/server/routeBuilder';
import { readApiErrorResponse } from '@/lib/api/errors';

test('readApiErrorResponse parses jsonError payloads', async () => {
  const res = jsonError(500, 'missing_env', 'TAVILY_API_KEY');
  const parsed = await readApiErrorResponse(res);
  assert.deepEqual(parsed, { error: 'missing_env', detail: 'TAVILY_API_KEY' });
});

test('routeBuilder returns missing_env detail for required env', async () => {
  delete process.env.MISSING_ENV_FOR_TEST;
  const handler = route('test-missing-env')
    .requireEnv('MISSING_ENV_FOR_TEST')
    .handler(async () => new Response('ok'));
  const res = await handler(new NextRequest('https://example.com/api/test'));
  const parsed = await readApiErrorResponse(res);
  assert.equal(parsed?.error, 'missing_env');
  assert.equal(parsed?.detail, 'MISSING_ENV_FOR_TEST');
});

test('jsonAuthError returns api error shape', async () => {
  const res = jsonAuthError('invalid_code', 401);
  const parsed = await readApiErrorResponse(res);
  assert.equal(parsed?.error, 'invalid_code');
});
