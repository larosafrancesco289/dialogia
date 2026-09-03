import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultZdrOnly, getRoutePreferenceDefault } from '@/lib/env/public';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.VITE_OR_ZDR_ONLY_DEFAULT;
  delete process.env.VITE_OR_ROUTE_PREFERENCE_DEFAULT;
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

test('getRoutePreferenceDefault falls back to balanced', () => {
  delete process.env.VITE_OR_ROUTE_PREFERENCE_DEFAULT;
  assert.equal(getRoutePreferenceDefault(), 'balanced');
  process.env.VITE_OR_ROUTE_PREFERENCE_DEFAULT = 'balanced';
  assert.equal(getRoutePreferenceDefault(), 'balanced');
  process.env.VITE_OR_ROUTE_PREFERENCE_DEFAULT = 'cost';
  assert.equal(getRoutePreferenceDefault(), 'cost');
  process.env.VITE_OR_ROUTE_PREFERENCE_DEFAULT = 'invalid';
  assert.equal(getRoutePreferenceDefault(), 'balanced');
});
