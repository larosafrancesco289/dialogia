import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { DEFAULT_REASONING_EFFORT } from '@/lib/settings/generation';
import type { Chat, GenerationSettings } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';

const buildChat = (generation: GenerationSettings): Chat => ({
  id: 'chat-1',
  title: 'Chat',
  createdAt: Date.now() - 1000,
  updatedAt: Date.now() - 500,
  settings: {
    modelId: 'anthropic/claude-fable-5',
    system: 'Be helpful.',
    generation,
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

const buildModelIndex = (canReason: boolean): ModelIndex => ({
  all: [],
  byId: new Map(),
  get: () => undefined,
  caps: () => ({ canReason, canSee: false, canAudio: false, canImageOut: false }),
  label: () => 'Model',
});

const ui = { flags: {}, tutor: {}, debug: {} } as never;

test('reasoning-capable models default to the standard effort when unset', () => {
  const settings = resolveTurnSettings({
    chat: buildChat({}),
    ui,
    modelIndex: buildModelIndex(true),
  });
  assert.equal(settings.generation.reasoningEffort, DEFAULT_REASONING_EFFORT);
});

test('an explicit "none" effort is preserved', () => {
  const settings = resolveTurnSettings({
    chat: buildChat({ reasoningEffort: 'none' }),
    ui,
    modelIndex: buildModelIndex(true),
  });
  assert.equal(settings.generation.reasoningEffort, 'none');
});

test('an explicit effort choice is preserved', () => {
  const settings = resolveTurnSettings({
    chat: buildChat({ reasoningEffort: 'high' }),
    ui,
    modelIndex: buildModelIndex(true),
  });
  assert.equal(settings.generation.reasoningEffort, 'high');
});

test('a token budget without effort does not get an effort injected', () => {
  const settings = resolveTurnSettings({
    chat: buildChat({ reasoningTokens: 2048 }),
    ui,
    modelIndex: buildModelIndex(true),
  });
  assert.equal(settings.generation.reasoningEffort, undefined);
  assert.equal(settings.generation.reasoningTokens, 2048);
});

test('non-reasoning models resolve without any effort', () => {
  const settings = resolveTurnSettings({
    chat: buildChat({}),
    ui,
    modelIndex: buildModelIndex(false),
  });
  assert.equal(settings.generation.reasoningEffort, undefined);
});
