import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOpenRouterProxyEnabled,
  getDefaultZdrOnly,
  getRoutePreferenceDefault,
} from '@/lib/config';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.NEXT_PUBLIC_USE_OR_PROXY;
  delete process.env.NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT;
  delete process.env.NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('isOpenRouterProxyEnabled defaults to false', () => {
  delete process.env.NEXT_PUBLIC_USE_OR_PROXY;
  assert.equal(isOpenRouterProxyEnabled(), false);
});

test('isOpenRouterProxyEnabled parses true-like values', () => {
  process.env.NEXT_PUBLIC_USE_OR_PROXY = 'TrUe';
  assert.equal(isOpenRouterProxyEnabled(), true);
});

test('getDefaultZdrOnly respects env flag', () => {
  delete process.env.NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT;
  assert.equal(getDefaultZdrOnly(), false);
  process.env.NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT = 'yes';
  assert.equal(getDefaultZdrOnly(), true);
});

test('getRoutePreferenceDefault falls back to speed', () => {
  delete process.env.NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT;
  assert.equal(getRoutePreferenceDefault(), 'speed');
  process.env.NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT = 'cost';
  assert.equal(getRoutePreferenceDefault(), 'cost');
  process.env.NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT = 'invalid';
  assert.equal(getRoutePreferenceDefault(), 'speed');
});
