import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsage, sumUsage } from '@/lib/api/normalizers';

test('normalizeUsage preserves provider cost and cache fields', () => {
  const usage = normalizeUsage({
    prompt_tokens: 100,
    completion_tokens: 20,
    cost: 0.0042,
    prompt_tokens_details: {
      cached_tokens: 80,
      cache_write_tokens: 10,
    },
    cost_details: {
      upstream_inference_cost: 0.003,
    },
  });

  assert.deepEqual(usage, {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    input_tokens: 100,
    output_tokens: 20,
    prompt_tokens_details: {
      cached_tokens: 80,
      cache_write_tokens: 10,
    },
    cost: 0.0042,
    cost_details: {
      upstream_inference_cost: 0.003,
    },
  });
});

test('sumUsage aggregates multi-call totals and rich usage details', () => {
  const total = sumUsage(
    normalizeUsage({
      input_tokens: 100,
      output_tokens: 20,
      cache_creation_input_tokens: 50,
      cost: 0.01,
    }),
    normalizeUsage({
      input_tokens: 10,
      output_tokens: 30,
      cache_read_input_tokens: 40,
      cost: 0.02,
    }),
  );

  assert.equal(total?.input_tokens, 110);
  assert.equal(total?.output_tokens, 50);
  assert.equal(total?.cache_creation_input_tokens, 50);
  assert.equal(total?.cache_read_input_tokens, 40);
  assert.equal(Number(total?.cost?.toFixed(2)), 0.03);
});
