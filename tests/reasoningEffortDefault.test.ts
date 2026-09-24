import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { DEFAULT_REASONING_EFFORT } from '@/lib/settings/generation';
import type { GenerationSettings, ModelDescriptor } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import { makeChat } from './helpers/makeChat';

const buildChat = (generation: GenerationSettings) =>
  makeChat({
    settings: { modelId: 'anthropic/claude-fable-5', system: 'Be helpful.', generation },
  });

const buildModelIndex = (canReason: boolean, model?: ModelDescriptor): ModelIndex => ({
  all: model ? [model] : [],
  byId: new Map(model ? [[model.id, model]] : []),
  get: () => model,
  caps: () => ({ canReason, canSee: false, canAudio: false, canImageOut: false }),
  label: () => 'Model',
});

const fableMeta: ModelDescriptor = {
  id: 'anthropic/claude-fable-5',
  name: 'Claude Fable 5',
  raw: {
    supported_parameters: ['reasoning'],
    reasoning: {
      supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'],
      default_effort: 'high',
      default_enabled: true,
      mandatory: true,
    },
  },
};

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

test('provider metadata drives the default effort (Fable defaults to high)', () => {
  const settings = resolveTurnSettings({
    chat: buildChat({}),
    ui,
    modelIndex: buildModelIndex(true, fableMeta),
  });
  assert.equal(settings.generation.reasoningEffort, 'high');
});

test('an explicit "none" on mandatory-reasoning models clamps to the weakest level', () => {
  const settings = resolveTurnSettings({
    chat: buildChat({ reasoningEffort: 'none' }),
    ui,
    modelIndex: buildModelIndex(true, fableMeta),
  });
  assert.equal(settings.generation.reasoningEffort, 'low');
});

test('non-reasoning models resolve without any effort', () => {
  const settings = resolveTurnSettings({
    chat: buildChat({}),
    ui,
    modelIndex: buildModelIndex(false),
  });
  assert.equal(settings.generation.reasoningEffort, undefined);
});
