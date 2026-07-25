import { ANTHROPIC_ENDPOINT } from '@/lib/transport/endpoints';
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
    { endpoint: ANTHROPIC_ENDPOINT, apiKey: 'test-key' },
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
    inputCacheRead: 0.0000005,
    inputCacheWrite: 0.00000625,
    currency: 'usd',
  });
  assert.equal(describeModelPricing(models[0]), 'in $5.00/M · out $25.00/M');
});

test('fetchModels synthesizes reasoning metadata from effort capabilities', async () => {
  const responseBody = {
    data: [
      {
        id: 'claude-fable-5',
        display_name: 'Claude Fable 5',
        capabilities: {
          thinking: { supported: true },
          effort: {
            supported: true,
            low: { supported: true },
            medium: { supported: true },
            high: { supported: true },
            xhigh: { supported: true },
            max: { supported: true },
          },
        },
      },
      {
        id: 'claude-haiku-4-5-20251001',
        display_name: 'Claude Haiku 4.5',
        capabilities: { thinking: { supported: true } },
      },
    ],
  };

  const models = await fetchModels(
    // Distinct key so the module-level model cache from the previous test
    // does not serve its response here.
    { endpoint: ANTHROPIC_ENDPOINT, apiKey: 'test-key-reasoning' },
    {
      fetchFn: async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    },
  );

  const fable = models.find((m) => m.id.includes('fable'));
  const fableReasoning = (fable?.raw as Record<string, unknown>).reasoning as Record<
    string,
    unknown
  >;
  assert.deepEqual(fableReasoning.supported_efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(fableReasoning.default_effort, 'high');
  assert.equal(fableReasoning.default_enabled, true);
  assert.equal(fableReasoning.mandatory, true);

  const haiku = models.find((m) => m.id.includes('haiku'));
  const haikuReasoning = (haiku?.raw as Record<string, unknown>).reasoning as Record<
    string,
    unknown
  >;
  // Manual-thinking model without effort capability: thinking off by default.
  assert.equal(haikuReasoning.default_enabled, false);
  assert.equal(haikuReasoning.mandatory, false);
});
