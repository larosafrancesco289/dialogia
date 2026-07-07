import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatCompletionMessages } from '@/lib/agent/prompt-builder';
import {
  formatMessageTimestamp,
  isPartialTimestampPrefix,
  stripLeadingTimestamp,
} from '@/lib/agent/prompts/timestamps';
import { composeTurn } from '@/lib/agent/compose';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import type { Chat, Message } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';

const TIMESTAMP_PREFIX = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] /;

const baseChat = (): Chat => ({
  id: 'chat-1',
  title: 'Timestamps',
  createdAt: Date.now() - 1000,
  updatedAt: Date.now() - 500,
  settings: {
    modelId: 'provider/model-alpha',
    system: 'Be brief.',
    generation: { maxTokens: 256 },
    ui: {
      showThinkingByDefault: false,
      showStats: false,
      showToolCallLog: false,
      showDebugRawJson: true,
    },
    features: {
      search: { enabled: false, provider: 'openrouter' },
      tutor: { enabled: false },
    },
  },
});

const priorMessages = (): Message[] => [
  {
    id: 'msg-1',
    chatId: 'chat-1',
    role: 'user',
    content: 'What day is it?',
    createdAt: new Date(2026, 5, 11, 9, 5).getTime(),
  },
  {
    id: 'msg-2',
    chatId: 'chat-1',
    role: 'assistant',
    content: 'I cannot know that.',
    createdAt: new Date(2026, 5, 11, 9, 6).getTime(),
  },
];

const modelIndexStub: ModelIndex = {
  all: [],
  byId: new Map(),
  get: () => undefined,
  caps: () => ({ canReason: false, canSee: false, canAudio: false, canImageOut: false }),
  label: () => 'Model Alpha',
};

test('formatMessageTimestamp renders local YYYY-MM-DD HH:MM', () => {
  const formatted = formatMessageTimestamp(new Date(2026, 5, 11, 9, 5).getTime());
  assert.equal(formatted, '2026-06-11 09:05');
});

test('buildChatCompletionMessages prefixes history and the new message when enabled', () => {
  const msgs = buildChatCompletionMessages({
    chat: baseChat(),
    priorMessages: priorMessages(),
    models: [],
    newUserContent: 'And now?',
    timestamps: true,
  });
  const conversation = msgs.filter((m) => m.role !== 'system');
  assert.equal(conversation.length, 3);
  for (const m of conversation) {
    assert.match(m.content as string, TIMESTAMP_PREFIX);
  }
  assert.equal(conversation[0].content, '[2026-06-11 09:05] What day is it?');
  assert.ok((conversation[2].content as string).endsWith('And now?'));
});

test('buildChatCompletionMessages leaves content untouched by default', () => {
  const msgs = buildChatCompletionMessages({
    chat: baseChat(),
    priorMessages: priorMessages(),
    models: [],
    newUserContent: 'And now?',
  });
  const conversation = msgs.filter((m) => m.role !== 'system');
  for (const m of conversation) {
    assert.doesNotMatch(m.content as string, TIMESTAMP_PREFIX);
  }
});

test('composeTurn adds the timestamp notice to the stable system prefix', async () => {
  const chat = baseChat();
  const ui = {
    flags: { experimentalTutor: false },
    tutor: { forceMode: false },
    messageTimestamps: true,
  } as any;
  const settings = resolveTurnSettings({
    chat,
    ui,
    modelIndex: modelIndexStub,
    modelId: chat.settings.modelId,
  });
  assert.equal(settings.timestampsEnabled, true);
  const result = await composeTurn({
    chat,
    ui,
    settings,
    modelIndex: modelIndexStub,
    prior: priorMessages(),
    newUser: { content: 'And now?' },
    attachments: [],
  });
  assert.ok(result.system?.includes('[YYYY-MM-DD HH:MM]'));
  assert.ok(result.systemStable?.includes('[YYYY-MM-DD HH:MM]'));
  const userMsgs = result.messages.filter((m) => m.role === 'user');
  assert.match(userMsgs[0].content as string, TIMESTAMP_PREFIX);
});

test('stripLeadingTimestamp removes an echoed prefix and leaves other text alone', () => {
  assert.equal(
    stripLeadingTimestamp('[2026-06-12 20:12] Ah, and there I was.'),
    'Ah, and there I was.',
  );
  assert.equal(stripLeadingTimestamp('[2026-06-12 20:12]'), '');
  assert.equal(stripLeadingTimestamp('No prefix here.'), 'No prefix here.');
  assert.equal(stripLeadingTimestamp('[not a timestamp] hello'), '[not a timestamp] hello');
  assert.equal(
    stripLeadingTimestamp('Logs say [2026-06-12 20:12] mid-text'),
    'Logs say [2026-06-12 20:12] mid-text',
  );
});

test('isPartialTimestampPrefix tracks growing stream heads', () => {
  assert.equal(isPartialTimestampPrefix('['), true);
  assert.equal(isPartialTimestampPrefix('[2026-06'), true);
  assert.equal(isPartialTimestampPrefix('[2026-06-12 20:1'), true);
  assert.equal(isPartialTimestampPrefix('[2026-06-12 20:12]'), false);
  assert.equal(isPartialTimestampPrefix('Hello'), false);
  assert.equal(isPartialTimestampPrefix('[20a6'), false);
});
