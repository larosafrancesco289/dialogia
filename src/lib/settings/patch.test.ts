import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeChatSettingsPatch,
  resetReasoningOnModelChange,
  stickyDefaultsFromPatch,
} from '@/lib/settings/patch';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/settings/chatDefaults';
import type { ChatSettings, ChatSettingsPatch } from '@/lib/types';

const base: ChatSettings = {
  modelId: 'provider/a',
  generation: { temperature: 0.3, reasoningEffort: 'high' },
  ui: { ...DEFAULT_DISPLAY_PREFERENCES },
  features: { search: { enabled: true, provider: 'tavily' }, tutor: { enabled: false } },
};

const apply = (patch: ChatSettingsPatch, settings = base) =>
  resetReasoningOnModelChange(settings.modelId, patch, mergeChatSettingsPatch(settings, patch));

test('a patch merges one level into each group', () => {
  const merged = mergeChatSettingsPatch(base, {
    generation: { topP: 0.9 },
    features: { search: { enabled: false } },
  });
  assert.deepEqual(merged.generation, { temperature: 0.3, reasoningEffort: 'high', topP: 0.9 });
  assert.deepEqual(merged.features.search, { enabled: false, provider: 'tavily' });
});

test('an old record missing its groups gets the fallbacks', () => {
  const legacy = { modelId: 'provider/a' } as unknown as ChatSettings;
  const merged = mergeChatSettingsPatch(legacy, {});
  assert.deepEqual(merged.generation, {});
  assert.deepEqual(merged.ui, DEFAULT_DISPLAY_PREFERENCES);
  assert.deepEqual(merged.features, {
    search: { enabled: false, provider: 'openrouter' },
    tutor: { enabled: false },
  });
});

test('a model switch clears reasoning unless the patch sets it', () => {
  const switched = apply({ modelId: 'provider/b' });
  assert.equal(switched.reset, true);
  assert.equal(switched.settings.generation.reasoningEffort, undefined);
  assert.equal(switched.settings.generation.temperature, 0.3);

  const withEffort = apply({ modelId: 'provider/b', generation: { reasoningEffort: 'low' } });
  assert.equal(withEffort.reset, false);
  assert.equal(withEffort.settings.generation.reasoningEffort, 'low');

  const sameModel = apply({ modelId: 'provider/a' });
  assert.equal(sameModel.reset, false);
  assert.equal(sameModel.settings.generation.reasoningEffort, 'high');
});

test('model and reasoning stick; other fields do not', () => {
  const patch: ChatSettingsPatch = { modelId: 'provider/b' };
  const { settings, reset } = apply(patch);
  assert.deepEqual(stickyDefaultsFromPatch(patch, settings, reset), {
    modelId: 'provider/b',
    generation: { reasoningEffort: undefined, reasoningTokens: undefined },
  });

  const effort: ChatSettingsPatch = { generation: { reasoningEffort: 'low', temperature: 1 } };
  const next = apply(effort);
  assert.deepEqual(stickyDefaultsFromPatch(effort, next.settings, next.reset), {
    generation: { reasoningEffort: 'low' },
  });

  const search: ChatSettingsPatch = { features: { search: { enabled: false } } };
  const off = apply(search);
  assert.equal(stickyDefaultsFromPatch(search, off.settings, off.reset), undefined);
});

test("a tutor chat's model does not stick", () => {
  const tutorChat: ChatSettings = {
    ...base,
    features: { ...base.features, tutor: { enabled: true } },
  };
  const patch: ChatSettingsPatch = {
    modelId: 'provider/b',
    generation: { reasoningEffort: 'low' },
  };
  const { settings, reset } = apply(patch, tutorChat);
  assert.deepEqual(stickyDefaultsFromPatch(patch, settings, reset), {
    generation: { reasoningEffort: 'low' },
  });
});
