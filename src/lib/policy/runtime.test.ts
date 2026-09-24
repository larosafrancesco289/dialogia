import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UiSnapshot } from '@/lib/contracts/ui';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { makeChat } from '../../../tests/helpers/makeChat';

const baseUi = (overrides?: Partial<UiSnapshot>): UiSnapshot => ({
  showSettings: false,
  activeTurnByChatId: {},
  flags: {},
  debug: {},
  search: {},
  tutor: {},
  plan: {},
  mobile: {
    drawerOpen: false,
    composerFocused: false,
  },
  ...overrides,
});

const baseChat = (tutorMode: boolean) =>
  makeChat({ settings: { features: { tutor: { enabled: tutorMode } } } });

test('tutor runtime respects the global tutor flag', () => {
  const uiDisabled = baseUi({ flags: { experimentalTutor: false } });
  const chatEnabled = baseChat(true);
  assert.equal(isTutorRuntimeEnabled(uiDisabled, chatEnabled), false);

  const uiEnabled = baseUi({ flags: { experimentalTutor: true } });
  assert.equal(isTutorRuntimeEnabled(uiEnabled, chatEnabled), true);
});

test('tutor runtime stays off when the chat has tutor disabled', () => {
  const ui = baseUi({ flags: { experimentalTutor: true } });
  assert.equal(isTutorRuntimeEnabled(ui, baseChat(false)), false);
});
