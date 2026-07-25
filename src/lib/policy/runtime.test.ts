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
    modelId: 'provider/model',
    generation: {},
    ui: {
      showThinkingByDefault: false,
      showStats: false,
      showToolCallLog: false,
      showDebugRawJson: true,
    },
    features: {
      search: { enabled: false, provider: 'openrouter' },
      tutor: { enabled: tutorMode },
    },
  },
});

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
