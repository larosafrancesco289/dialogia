import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectSearchMode } from './provider';
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
} as any;

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
