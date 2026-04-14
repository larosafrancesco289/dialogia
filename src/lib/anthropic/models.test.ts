import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchModels } from '@/lib/anthropic/models';
import { describeModelPricing } from '@/lib/cost';

test('fetchModels exposes Anthropic pricing in per-token units', async () => {
  const responseBody = {
    data: [
      {
        id: 'claude-opus-4-6',
        display_name: 'Claude Opus 4.6',
        max_input_tokens: 1_000_000,
      },
    ],
  };

  const models = await fetchModels(
    {
      transport: 'anthropic',
      apiKey: 'test-key',
      useProxy: false,
    },
    {
      fetchFn: async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    },
  );

  assert.equal(models.length, 1);
  assert.deepEqual(models[0]?.pricing, {
    prompt: 0.000005,
    completion: 0.000025,
    currency: 'usd',
  });
  assert.equal(describeModelPricing(models[0]), 'in $5.00/M · out $25.00/M');
});
