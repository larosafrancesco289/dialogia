import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearOpenRouterCachesForTest, fetchModels, fetchZdrLists } from '@/lib/openrouter';
import { buildTransportAuth } from '@/lib/auth/transport';

const okResponse = (payload: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => payload,
  }) as any;

test('fetchModels caches repeated lookups for the same API key', async () => {
  clearOpenRouterCachesForTest();
  let calls = 0;
  const fakeFetcher = async () => {
    calls += 1;
    return okResponse({
      data: [{ id: 'test/model', name: 'Model', context_length: 1, pricing: {} }],
    });
  };

  const auth = buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'key-123' });
  const first = await fetchModels(auth, { fetchFn: fakeFetcher });
  const second = await fetchModels(auth, { fetchFn: fakeFetcher });

  assert.equal(calls, 1);
  assert.equal(first[0]?.id, 'test/model');
  assert.equal(second[0]?.id, 'test/model');
});

test('fetchZdrLists derives both lists from a single endpoint fetch', async () => {
  clearOpenRouterCachesForTest();
  let calls = 0;
  const fakeFetcher = async () => {
    calls += 1;
    return okResponse({
      data: [
        { provider: 'moonshotai', models: ['moonshotai/moon-1'] },
        { provider: 'mistralai', models: ['mistralai/mixtral-8x7b'] },
      ],
    });
  };

  const { modelIds, providerIds } = await fetchZdrLists(fakeFetcher);

  assert.equal(calls, 1);
  assert.ok(providerIds.has('moonshotai'));
  assert.ok(providerIds.has('mistralai'));
  assert.ok(modelIds.has('mistralai/mixtral-8x7b'));
  assert.ok(modelIds.has('moonshotai/moon-1'));
});

test('fetchZdrLists returns empty lists when the endpoint fails', async () => {
  clearOpenRouterCachesForTest();
  const failingFetcher = async () => ({ ok: false, status: 502, json: async () => ({}) }) as any;

  const { modelIds, providerIds } = await fetchZdrLists(failingFetcher);

  assert.equal(modelIds.size, 0);
  assert.equal(providerIds.size, 0);
});
