import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderPolicy, providerSortFromRoutePref, selectSearchProvider } from './provider';

const baseSettings = {
  model: 'foo',
  search_enabled: true,
  search_provider: 'brave' as const,
};

const baseUi = {
  flags: { experimentalBrave: true },
  routePreference: 'speed' as const,
} as any;

test('providerSortFromRoutePref maps UI preference', () => {
  assert.equal(providerSortFromRoutePref('speed'), 'throughput');
  assert.equal(providerSortFromRoutePref('cost'), 'price');
  assert.equal(providerSortFromRoutePref(undefined), undefined);
});

test('selectSearchProvider respects UI brave toggle', () => {
  assert.equal(selectSearchProvider(baseSettings as any, baseUi), 'brave');
  assert.equal(
    selectSearchProvider(
      baseSettings as any,
      { ...baseUi, flags: { experimentalBrave: false } } as any,
    ),
    'openrouter',
  );
  assert.equal(
    selectSearchProvider({ ...baseSettings, search_provider: 'openrouter' } as any, baseUi),
    'openrouter',
  );
});

test('buildProviderPolicy surfaces unified routing decisions', () => {
  const policy = buildProviderPolicy({ settings: baseSettings as any, ui: baseUi });
  assert.equal(policy.searchEnabled, true);
  assert.equal(policy.searchProvider, 'brave');
  assert.equal(policy.providerSort, 'throughput');
});
