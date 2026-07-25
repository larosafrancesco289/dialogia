import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderPolicy, providerSortFromRoutePref, selectSearchMode } from './provider';
import { setKey, deleteKey } from '@/lib/keys/store';
import { NATIVE_SEARCH_MODE } from '@/lib/search/providers';

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

test('a configured tool-based provider is used once it has a key', async () => {
  await setKey('tavily', 'tvly-test');
  try {
    assert.equal(selectSearchMode(baseSettings as any, baseUi), 'tavily');
  } finally {
    await deleteKey('tavily');
  }
});

test('a keyless tool-based provider degrades to native search rather than failing', () => {
  // The chat still says 'tavily'; this machine simply has no key for it.
  assert.equal(selectSearchMode(baseSettings as any, baseUi), NATIVE_SEARCH_MODE);
});

test('search mode defaults to native when the chat names no provider', () => {
  assert.equal(
    selectSearchMode(
      {
        ...baseSettings,
        features: {
          ...baseSettings.features,
          search: { enabled: true },
        },
      } as any,
      baseUi,
    ),
    NATIVE_SEARCH_MODE,
  );
});

test('an unregistered provider id degrades to native search', () => {
  assert.equal(
    selectSearchMode(
      {
        ...baseSettings,
        features: {
          ...baseSettings.features,
          search: { enabled: true, provider: 'does-not-exist' },
        },
      } as any,
      baseUi,
    ),
    NATIVE_SEARCH_MODE,
  );
});

test('buildProviderPolicy surfaces unified routing decisions', () => {
  const policy = buildProviderPolicy({ settings: baseSettings as any, ui: baseUi });
  assert.equal(policy.searchEnabled, true);
  assert.equal(policy.searchProvider, NATIVE_SEARCH_MODE);
  assert.equal(policy.providerSort, undefined);
});
