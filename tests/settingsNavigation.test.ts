import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAB_LIST,
  initialSettingsTab,
  rememberSettingsTab,
  sectionMatches,
} from '@/components/settings/sections/config';

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
