import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPENROUTER_FREE_MODEL_ID } from '@/data/freeModels';
import { isModelAllowedForTier } from '@/lib/auth/tierFeatures';

test('free tier restricts models to free models', () => {
  // The openrouter/free endpoint should be allowed
  assert.ok(isModelAllowedForTier('free', OPENROUTER_FREE_MODEL_ID));
  // Any model ending in :free should be allowed
  assert.ok(isModelAllowedForTier('free', 'some-provider/model:free'));
  // Paid models should not be allowed
  assert.equal(isModelAllowedForTier('free', 'provider/paid-model'), false);
});

test('paid tiers allow all models', () => {
  assert.equal(isModelAllowedForTier('developer', 'provider/paid-model'), true);
});
