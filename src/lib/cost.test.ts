import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCost, describeModelPricing } from './cost';

test('describeModelPricing formats prompt/completion rates from numbers or strings', () => {
  const model: any = {
    pricing: {
      prompt: 0.005,
      completion: '0.015',
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
      prompt: 0.004,
      completion: 0.02,
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
