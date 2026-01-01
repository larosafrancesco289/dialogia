import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chat } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';

const baseUi = (overrides?: Partial<UiSnapshot>): UiSnapshot => ({
  showSettings: false,
  activeTurnByChatId: {},
  flags: {},
  debug: {},
  search: {},
  tutor: {},
  plan: {},
  mobile: {
    activeTab: 'chats',
    chatsSheetOpen: false,
    settingsSheetOpen: false,
    headerVisible: true,
    swipeRevealedMessageId: null,
    lastScrollY: 0,
    composerFocused: false,
  },
  ...overrides,
});

const baseChat = (tutorMode: boolean): Chat => ({
  id: 'chat-1',
  title: 'Chat',
  createdAt: 0,
  updatedAt: 0,
  settings: {
    model: 'provider/model',
    tutor_mode: tutorMode,
  },
});

test('study tier forces tutor mode even when globally disabled', () => {
  const ui = baseUi({ flags: { experimentalTutor: false } });
  const chat = baseChat(false);
  assert.equal(isTutorRuntimeEnabled(ui, chat, 'study'), true);
});

test('non-study tiers respect global tutor flag', () => {
  const uiDisabled = baseUi({ flags: { experimentalTutor: false } });
  const chatEnabled = baseChat(true);
  assert.equal(isTutorRuntimeEnabled(uiDisabled, chatEnabled, 'free'), false);

  const uiEnabled = baseUi({ flags: { experimentalTutor: true } });
  assert.equal(isTutorRuntimeEnabled(uiEnabled, chatEnabled, 'free'), true);
});
