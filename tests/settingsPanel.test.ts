import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';
import type { PersistedStoreState } from '@/lib/store/types';
import { resolveDeveloperPanel } from '@/lib/ui/developerPanel';
import {
  TAB_SECTIONS,
  sectionMatches,
  TAB_LIST,
  initialSettingsTab,
  rememberSettingsTab,
} from '@/components/settings/sections/config';
import { createTestStore } from './helpers/createTestStoreState';

test('the developer panel shows the request only while the request view is on', () => {
  const base = { debugBody: '{"model":"x"}', showToolCallLog: false, toolCallCount: 0 };
  assert.equal(resolveDeveloperPanel({ ...base, debugMode: false }), null);
  assert.deepEqual(resolveDeveloperPanel({ ...base, debugMode: true }), {
    body: '{"model":"x"}',
    showToolCalls: false,
  });
  assert.equal(resolveDeveloperPanel({ ...base, debugBody: '  ', debugMode: true }), null);
});

test('the tool-call log needs only its own switch and a reply that called tools', () => {
  const on = { debugMode: false, showToolCallLog: true };
  assert.deepEqual(resolveDeveloperPanel({ ...on, toolCallCount: 2 }), {
    body: undefined,
    showToolCalls: true,
  });
  assert.equal(resolveDeveloperPanel({ ...on, toolCallCount: 0 }), null);
  assert.equal(resolveDeveloperPanel({ ...on, showToolCallLog: false, toolCallCount: 2 }), null);
});

test('the request view switch persists under its existing key', () => {
  const store = createTestStore();
  store.getState().setUI({ debug: { mode: true } });
  const persisted = buildPersistedState(store.getState());
  assert.deepEqual(persisted.ui.debug, { mode: true });
  const rehydrated = mergePersistedState(
    createTestStore().getState(),
    persisted as PersistedStoreState,
  );
  assert.equal(rehydrated.ui.debug.mode, true);
});

test('the Developer group sits in Appearance and search finds it', () => {
  assert.ok(TAB_SECTIONS.appearance.includes('developer'));
  for (const query of ['developer', 'debug', 'tool call', 'raw json']) {
    assert.ok(sectionMatches('developer', query), query);
  }
  assert.ok(sectionMatches('display', 'introduction'));
});

test('Settings opens on the first tab listed, then on the last one used', () => {
  assert.equal(initialSettingsTab(), TAB_LIST[0].id);
  assert.equal(initialSettingsTab(), 'connections');
  rememberSettingsTab('appearance');
  assert.equal(initialSettingsTab(), 'appearance');
  rememberSettingsTab(TAB_LIST[0].id);
});

test('search finds Your servers by what a local server is for', () => {
  for (const query of ['key', 'model', 'server', 'ollama', 'local', 'api key', 'your servers']) {
    assert.ok(sectionMatches('endpoints', query), query);
  }
});
