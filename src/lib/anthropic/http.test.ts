import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anFetchModels } from '@/lib/anthropic/http';
import { ANTHROPIC_ENDPOINT } from '@/lib/transport/endpoints';
import { mockFetch } from '../../../tests/helpers/mockFetch';

test('a BYOK Anthropic call carries the browser-access opt-in header', async () => {
  let headers: Record<string, string> = {};
  const restore = mockFetch((async (_input: RequestInfo | URL, init?: RequestInit) => {
    headers = (init?.headers ?? {}) as Record<string, string>;
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  }) as never);
  try {
    await anFetchModels({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'sk-test' });
  } finally {
    restore();
  }
  assert.equal(headers['x-api-key'], 'sk-test');
  assert.equal(headers['anthropic-version'], '2023-06-01');
  assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true');
});
