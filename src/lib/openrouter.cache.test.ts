import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearOpenRouterCachesForTest,
  fetchModels,
  fetchZdrModelIds,
  fetchZdrProviderIds,
} from '@/lib/openrouter';
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

  const auth = buildTransportAuth({ transport: 'openrouter', apiKey: 'key-123', useProxy: false });
  const first = await fetchModels(auth, { fetchFn: fakeFetcher });
  const second = await fetchModels(auth, { fetchFn: fakeFetcher });

  assert.equal(calls, 1);
  assert.equal(first[0]?.id, 'test/model');
  assert.equal(second[0]?.id, 'test/model');
});

test('ZDR endpoint lookups do not share transport cache', async () => {
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

  const providers = await fetchZdrProviderIds(fakeFetcher);
  const modelIds = await fetchZdrModelIds(fakeFetcher);

  assert.equal(calls, 2);
  assert.ok(providers.has('moonshotai'));
  assert.ok(modelIds.has('mistralai/mixtral-8x7b'));
});
