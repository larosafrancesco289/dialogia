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

test('a proxied Anthropic call carries no client credentials at all', async () => {
  let headers: Record<string, string> = {};
  let url = '';
  const restore = mockFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    url = String(input);
    headers = (init?.headers ?? {}) as Record<string, string>;
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  }) as never);
  try {
    await anFetchModels({ endpoint: { ...ANTHROPIC_ENDPOINT, useProxy: true } });
  } finally {
    restore();
  }
  assert.ok(url.startsWith('/api/anthropic'));
  assert.equal(headers['x-api-key'], undefined);
  assert.equal(headers['anthropic-dangerous-direct-browser-access'], undefined);
});

test('a key the user pasted wins over the deployment proxy', async () => {
  let url = '';
  let headers: Record<string, string> = {};
  const restore = mockFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    url = String(input);
    headers = (init?.headers ?? {}) as Record<string, string>;
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  }) as never);
  try {
    await anFetchModels({
      endpoint: { ...ANTHROPIC_ENDPOINT, useProxy: true },
      apiKey: 'sk-ant-mine',
    });
  } finally {
    restore();
  }
  assert.ok(url.startsWith('https://api.anthropic.com/v1'));
  assert.equal(headers['x-api-key'], 'sk-ant-mine');
});
