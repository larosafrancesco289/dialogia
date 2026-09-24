import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateChatSettingsRecord, migrateGenSettingsRecord } from './migrations';
import { makeChat } from '../../../tests/helpers/makeChat';

// Both run on real users' stored rows (the Dexie upgrade and every read), so
// each legacy spelling must keep landing on the current field.

test('migrateGenSettingsRecord maps the snake_case and nested spellings', () => {
  const { next, changed } = migrateGenSettingsRecord({
    temperature: 0.5,
    top_p: 0.9,
    max_tokens: 512,
    reasoning: { effort: 'high', max_tokens: 2048 },
    provider_sort: 'price',
    search_enabled: true,
    search_provider: 'brave',
    tutor_mode: true,
  });
  assert.equal(changed, true);
  assert.deepEqual(next, {
    temperature: 0.5,
    topP: 0.9,
    maxTokens: 512,
    reasoningEffort: 'high',
    reasoningTokens: 2048,
    providerSort: 'price',
    searchEnabled: true,
    searchProvider: 'tavily',
    tutorEnabled: true,
  });
});

test('migrateGenSettingsRecord reads search_with_brave as Tavily search', () => {
  assert.deepEqual(migrateGenSettingsRecord({ search_with_brave: true }).next, {
    searchEnabled: true,
    searchProvider: 'tavily',
  });
  // Off, it adds nothing.
  assert.deepEqual(migrateGenSettingsRecord({ search_with_brave: false }).next, {});
});

test('migrateGenSettingsRecord prefers the current spelling and drops invalid values', () => {
  const { next } = migrateGenSettingsRecord({
    topP: 0.8,
    top_p: 0.1,
    reasoningEffort: 'turbo',
    reasoning_effort: 'low',
    maxTokens: 'lots',
    temperature: null,
    searchProvider: 'openrouter',
    unknownField: 1,
  });
  assert.deepEqual(next, {
    topP: 0.8,
    reasoningEffort: 'low',
    searchProvider: 'openrouter',
  });
});

test('migrateGenSettingsRecord leaves a current snapshot and non-records unchanged', () => {
  const current = {
    temperature: 0.2,
    maxTokens: 100,
    reasoningEffort: 'medium',
    searchEnabled: true,
    searchProvider: 'openrouter',
  };
  assert.deepEqual(migrateGenSettingsRecord(current), { next: current, changed: false });
  // The same snapshot saved with its keys in another order is no change either.
  const reordered = {
    searchProvider: 'openrouter',
    reasoningEffort: 'medium',
    maxTokens: 100,
    searchEnabled: true,
    temperature: 0.2,
  };
  assert.equal(migrateGenSettingsRecord(reordered).changed, false);
  // A key the snapshot does not keep is.
  assert.equal(migrateGenSettingsRecord({ ...current, top_p: 0.5 }).changed, true);
  assert.deepEqual(migrateGenSettingsRecord(undefined), { next: undefined, changed: false });
  assert.deepEqual(migrateGenSettingsRecord('x'), { next: 'x', changed: false });
});

test('migrateChatSettingsRecord lifts a legacy flat snake_case record into the nested shape', () => {
  const next = migrateChatSettingsRecord({
    model_id: 'openai/gpt-4o',
    system: 'Be brief.',
    temperature: 0.3,
    top_p: 0.7,
    max_tokens: 256,
    reasoning_effort: 'low',
    reasoning_tokens: 64,
    search_with_brave: true,
    tutor_mode: true,
    tutor_default_model: 'provider/tutor',
    show_stats: true,
  });
  assert.deepEqual(next, {
    modelId: 'openai/gpt-4o',
    system: 'Be brief.',
    generation: {
      temperature: 0.3,
      topP: 0.7,
      maxTokens: 256,
      reasoningEffort: 'low',
      reasoningTokens: 64,
    },
    ui: {
      showThinkingByDefault: false,
      showStats: true,
      showToolCallLog: false,
      showDebugRawJson: true,
    },
    features: {
      search: { enabled: true, provider: 'tavily' },
      tutor: { enabled: true, defaultModelId: 'provider/tutor' },
    },
  });
});

test('migrateChatSettingsRecord reads nested reasoning.max_tokens and generation snake_case', () => {
  const next = migrateChatSettingsRecord({
    model: 'provider/model',
    generation: { top_p: 0.4, reasoning: { effort: 'high', max_tokens: 4096 } },
  }) as { modelId: string; generation: Record<string, unknown> };
  assert.equal(next.modelId, 'provider/model');
  assert.deepEqual(next.generation, { topP: 0.4, reasoningEffort: 'high', reasoningTokens: 4096 });
});

test('migrateChatSettingsRecord maps a stored brave provider to tavily and defaults to native search', () => {
  const brave = migrateChatSettingsRecord({
    modelId: 'm',
    features: { search: { enabled: true, provider: 'brave' } },
  }) as { features: { search: unknown } };
  assert.deepEqual(brave.features.search, { enabled: true, provider: 'tavily' });

  const unnamed = migrateChatSettingsRecord({ modelId: 'm' }) as {
    features: { search: unknown; tutor: unknown };
  };
  assert.deepEqual(unnamed.features.search, { enabled: false, provider: 'openrouter' });
  assert.deepEqual(unnamed.features.tutor, { enabled: false });
});

test('migrateChatSettingsRecord keeps current settings as they are', () => {
  const settings = makeChat({
    settings: {
      system: 'Be brief.',
      generation: { temperature: 0.2, reasoningEffort: 'medium' },
      features: { tutor: { enabled: true, planEditable: false } },
    },
  }).settings;
  assert.deepEqual(migrateChatSettingsRecord(settings), settings);
  assert.equal(migrateChatSettingsRecord(null), null);
});
