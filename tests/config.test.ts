import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultZdrOnly } from '@/lib/env/public';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.VITE_OR_ZDR_ONLY_DEFAULT;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('getDefaultZdrOnly respects env flag', () => {
  delete process.env.VITE_OR_ZDR_ONLY_DEFAULT;
  assert.equal(getDefaultZdrOnly(), false);
  process.env.VITE_OR_ZDR_ONLY_DEFAULT = 'yes';
  assert.equal(getDefaultZdrOnly(), true);
});
