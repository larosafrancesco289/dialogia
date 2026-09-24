import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  resolveDisplayPreferences,
} from '@/lib/settings/chatDefaults';
import { buildSettingsSavePatch } from '@/components/settings/saveSettings';
import { createTestStore } from './helpers/createTestStoreState';

test('with nothing saved, display preferences are the defaults', () => {
  assert.deepEqual(resolveDisplayPreferences(undefined), DEFAULT_DISPLAY_PREFERENCES);
  assert.deepEqual(resolveDisplayPreferences({ ui: {} }), DEFAULT_DISPLAY_PREFERENCES);
});

test('a saved display preference applies at once, whatever a chat copied when created', () => {
  const store = createTestStore();
  const before = resolveDisplayPreferences(store.getState().ui.chatDefaults);
  assert.equal(before.showStats, false);

  store.getState().setUI(
    buildSettingsSavePatch({
      system: 'Be brief.',
      showThinking: true,
      showStats: true,
      showToolCallLog: true,
      showDebugRawJson: false,
    }).uiPatch,
  );

  const after = resolveDisplayPreferences(store.getState().ui.chatDefaults);
  assert.deepEqual(after, {
    showThinkingByDefault: true,
    showStats: true,
    showToolCallLog: true,
    showDebugRawJson: false,
  });
});
