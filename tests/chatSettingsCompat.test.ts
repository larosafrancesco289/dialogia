import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChatSettings } from '@/lib/settings/normalize';
import { ChatSettingsSchema } from '@/lib/schemas/persisted';

const legacyPersistedSettings = {
  modelId: 'anthropic/claude-3.5-sonnet',
  parallelModels: ['openai/gpt-4.1-mini'],
  system: 'Be brief.',
  generation: { temperature: 0.4 },
  ui: {
    showThinkingByDefault: true,
    showStats: false,
    showToolCallLog: false,
    showDebugRawJson: true,
  },
  features: {
    search: { enabled: true, provider: 'tavily' },
    tutor: {
      enabled: true,
      researchMode: 'plan_plus_model',
      defaultModelId: 'anthropic/claude-3.5-haiku',
      enableLearnerModel: true,
    },
  },
};

test('a pre-refactor persisted chat still parses', () => {
  const parsed = ChatSettingsSchema.safeParse(legacyPersistedSettings);
  assert.equal(parsed.success, true);
});

test('normalizing a pre-refactor chat keeps the tutor block and drops removed fields', () => {
  const settings = normalizeChatSettings(legacyPersistedSettings, {
    fallbackModelId: 'openai/gpt-4.1-mini',
    fallbackTutorModelId: 'anthropic/claude-3.5-haiku',
  });

  assert.equal(settings.modelId, 'anthropic/claude-3.5-sonnet');
  assert.equal(settings.system, 'Be brief.');
  assert.equal(settings.features.tutor?.enabled, true);
  assert.equal(settings.features.tutor?.defaultModelId, 'anthropic/claude-3.5-haiku');
  assert.equal('parallelModels' in settings, false);
  assert.equal('researchMode' in (settings.features.tutor ?? {}), false);
});

test('a chat with no tutor block at all is valid and normalizes', () => {
  const withoutTutor = {
    ...legacyPersistedSettings,
    features: { search: { enabled: false, provider: 'openrouter' } },
  };

  assert.equal(ChatSettingsSchema.safeParse(withoutTutor).success, true);

  const settings = normalizeChatSettings(withoutTutor, {
    fallbackModelId: 'openai/gpt-4.1-mini',
    fallbackTutorModelId: 'anthropic/claude-3.5-haiku',
  });
  assert.equal(settings.features.search.enabled, false);
  assert.equal(settings.features.tutor?.enabled, false);
});
