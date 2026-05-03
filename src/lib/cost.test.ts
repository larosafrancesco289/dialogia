import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCost, describeModelPricing } from './cost';

test('describeModelPricing formats prompt/completion rates from numbers or strings', () => {
  const model: any = {
    pricing: {
      prompt: 0.000005,
      completion: '0.000015',
      currency: 'USD',
    },
  };
  const formatted = describeModelPricing(model);
  assert.equal(formatted, 'in $5.00/M · out $15.00/M');
});

test('describeModelPricing falls back to undefined when rates missing or invalid', () => {
  assert.equal(describeModelPricing(undefined), undefined);
  assert.equal(describeModelPricing({ pricing: {} } as any), undefined);
  assert.equal(
    describeModelPricing({ pricing: { prompt: 'n/a', completion: null } } as any),
    undefined,
  );
});

test('computeCost sums prompt and completion usage in model currency', () => {
  const model: any = {
    pricing: {
      prompt: 0.000004,
      completion: 0.00002,
      currency: 'USD',
    },
  };
  const cost = computeCost({ model, promptTokens: 250, completionTokens: 750 });
  assert.equal(cost.currency, 'USD');
  assert.ok(cost.total);
  assert.equal(Number(cost.total?.toFixed(4)), 0.016);
});

test('computeCost handles missing pricing gracefully', () => {
  const cost = computeCost({ promptTokens: 100, completionTokens: 200 });
  assert.equal(cost.currency, 'USD');
  assert.equal(cost.total, undefined);
});

test('computeCost trusts provider-reported cost when present', () => {
  const cost = computeCost({
    model: { id: 'openai/gpt-5', pricing: { prompt: 1, completion: 1, currency: 'USD' } },
    promptTokens: 100,
    completionTokens: 200,
    usage: {
      prompt_tokens: 100,
      completion_tokens: 200,
      cost: 0.012345,
    },
  });

  assert.equal(cost.total, 0.012345);
});

test('computeCost accounts for direct Anthropic cache read and write tokens', () => {
  const model: any = {
    id: 'anthropic-direct/claude-sonnet-4-6',
    transport: 'anthropic',
    pricing: {
      prompt: 0.000003,
      completion: 0.000015,
      inputCacheRead: 0.0000003,
      inputCacheWrite: 0.00000375,
      currency: 'USD',
    },
  };
  const cost = computeCost({
    model,
    usage: {
      input_tokens: 100,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
      output_tokens: 50,
    },
  });

  assert.equal(Number(cost.total?.toFixed(5)), 0.00189);
});
