import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAccessTier } from '@/lib/auth/tier.shared';

test('parseAccessTier returns valid tiers and defaults to free', () => {
  assert.equal(parseAccessTier('free'), 'free');
  assert.equal(parseAccessTier('individual'), 'individual');
  assert.equal(parseAccessTier('developer'), 'developer');
  assert.equal(parseAccessTier('study'), 'study');
  assert.equal(parseAccessTier('unknown'), 'free');
  assert.equal(parseAccessTier(undefined), 'free');
});
