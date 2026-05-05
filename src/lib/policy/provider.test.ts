import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderPolicy, providerSortFromRoutePref, selectSearchProvider } from './provider';

const baseSettings = {
  modelId: 'foo',
  generation: {},
  ui: {
    showThinkingByDefault: false,
    showStats: false,
    showToolCallLog: false,
    showDebugRawJson: true,
  },
  features: {
    search: { enabled: true, provider: 'tavily' as const },
    tutor: { enabled: false },
  },
};

const baseUi = {
  flags: {},
  routePreference: 'speed' as const,
} as any;

test('providerSortFromRoutePref maps UI preference', () => {
  assert.equal(providerSortFromRoutePref('speed'), 'throughput');
  assert.equal(providerSortFromRoutePref('cost'), 'price');
  assert.equal(providerSortFromRoutePref('balanced'), undefined);
  assert.equal(providerSortFromRoutePref(undefined), undefined);
});

test('selectSearchProvider respects configured provider', () => {
  assert.equal(selectSearchProvider(baseSettings as any, baseUi), 'tavily');
  assert.equal(
    selectSearchProvider(
      {
        ...baseSettings,
        features: {
          ...baseSettings.features,
          search: { enabled: true, provider: 'openrouter' },
        },
      } as any,
      baseUi,
    ),
    'openrouter',
  );
});

test('selectSearchProvider defaults to Tavily without an explicit provider', () => {
  assert.equal(
    selectSearchProvider(
      {
        ...baseSettings,
        features: {
          ...baseSettings.features,
          search: { enabled: true },
        },
      } as any,
      baseUi,
    ),
    'tavily',
  );
});

test('buildProviderPolicy surfaces unified routing decisions', () => {
  const policy = buildProviderPolicy({ settings: baseSettings as any, ui: baseUi });
  assert.equal(policy.searchEnabled, true);
  assert.equal(policy.searchProvider, 'tavily');
  assert.equal(policy.providerSort, undefined);
});
