import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anFetchModels, anMessages } from '@/lib/anthropic/http';
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

test('a key scoped to no workspace names the one set on the connection', async () => {
  const sent: Array<Record<string, string>> = [];
  const restore = mockFetch((async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push((init?.headers ?? {}) as Record<string, string>);
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  }) as never);
  try {
    await anFetchModels({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'sk-test' });
    await anMessages({
      auth: { endpoint: { ...ANTHROPIC_ENDPOINT, workspaceId: 'wrkspc_1' }, apiKey: 'sk-test' },
      body: {},
    });
  } finally {
    restore();
  }
  assert.equal('anthropic-workspace-id' in sent[0], false);
  assert.equal(sent[1]['anthropic-workspace-id'], 'wrkspc_1');
});
