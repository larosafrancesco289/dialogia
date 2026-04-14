import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelDescriptor } from '@/lib/models/normalization';
import { describeModelPricing } from '@/lib/cost';

test('normalizeModelDescriptor parses numeric pricing strings', () => {
  const model = normalizeModelDescriptor({
    id: 'openrouter/openai/gpt-5',
    name: 'GPT-5',
    pricing: {
      prompt: '0.00000125',
      completion: '0.00001',
      currency: 'usd',
    },
  });

  assert.ok(model);
  assert.deepEqual(model?.pricing, {
    prompt: 0.00000125,
    completion: 0.00001,
    currency: 'usd',
  });
  assert.equal(describeModelPricing(model), 'in $1.25/M · out $10.00/M');
});

test('normalizeModelDescriptor ignores invalid pricing strings', () => {
  const model = normalizeModelDescriptor({
    id: 'openrouter/openai/gpt-5',
    pricing: {
      prompt: 'n/a',
      completion: '',
      currency: 'usd',
    },
  });

  assert.equal(model?.pricing?.prompt, undefined);
  assert.equal(model?.pricing?.completion, undefined);
  assert.equal(model?.pricing?.currency, 'usd');
  assert.equal(describeModelPricing(model), undefined);
});
