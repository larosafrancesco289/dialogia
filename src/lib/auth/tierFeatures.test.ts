import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FREE_MODEL_IDS } from '@/data/freeModels';
import { isModelAllowedForTier, isTutorForcedForTier } from '@/lib/auth/tierFeatures';

test('free tier restricts models to allowlist', () => {
  const allowed = FREE_MODEL_IDS[0];
  assert.ok(isModelAllowedForTier('free', allowed));
  assert.equal(isModelAllowedForTier('free', 'provider/paid-model'), false);
});

test('paid tiers allow all models', () => {
  assert.equal(isModelAllowedForTier('developer', 'provider/paid-model'), true);
});

test('study tier forces tutor mode', () => {
  assert.equal(isTutorForcedForTier('study'), true);
  assert.equal(isTutorForcedForTier('free'), false);
});
