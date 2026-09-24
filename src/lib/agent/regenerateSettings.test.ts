import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRegenerationSettings } from '@/lib/agent/regenerateSettings';
import { ProviderSort } from '@/lib/models/providerSort';
import type { ChatSettings, GenSettingsSnapshot } from '@/lib/types';

const chatSettings = (overrides: Partial<ChatSettings> = {}): ChatSettings => ({
  modelId: 'provider/current',
  generation: { temperature: 0.2, topP: 0.5, reasoningEffort: 'low', reasoningTokens: 100 },
  ui: {
    showThinkingByDefault: false,
    showStats: false,
    showToolCallLog: false,
    showDebugRawJson: false,
  },
  features: { search: { enabled: false, provider: 'openrouter' }, tutor: { enabled: false } },
  ...overrides,
});

const snapshot: GenSettingsSnapshot = {
  temperature: 0.9,
  maxTokens: 512,
  reasoningEffort: 'high',
  reasoningTokens: 4000,
  searchEnabled: true,
  searchProvider: 'tavily',
  tutorEnabled: true,
};

test('same model: the snapshot wins, the chat fills what it lacks', () => {
  const { genSettings, chatSettings: next } = resolveRegenerationSettings({
    original: { genSettings: snapshot, model: 'provider/old' },
    settings: chatSettings(),
    modelId: 'provider/old',
    supportsReasoning: true,
  });
  assert.deepEqual(genSettings, {
    temperature: 0.9,
    topP: 0.5,
    maxTokens: 512,
    reasoningEffort: 'high',
    reasoningTokens: 4000,
    searchEnabled: true,
    searchProvider: 'tavily',
    tutorEnabled: true,
  });
  assert.equal(next.modelId, 'provider/old');
  assert.equal(next.generation.temperature, 0.9);
  assert.equal(next.generation.reasoningEffort, 'high');
  assert.deepEqual(next.features.search, { enabled: true, provider: 'tavily' });
  assert.equal(next.features.tutor?.enabled, true);
});

test('changed model: the chat wins, the snapshot fills what it lacks', () => {
  const { genSettings, chatSettings: next } = resolveRegenerationSettings({
    original: { genSettings: snapshot, model: 'provider/old' },
    settings: chatSettings(),
    modelId: 'provider/new',
    supportsReasoning: true,
  });
  assert.equal(genSettings.temperature, 0.2);
  assert.equal(genSettings.topP, 0.5);
  assert.equal(genSettings.maxTokens, 512);
  assert.equal(genSettings.searchEnabled, false);
  assert.equal(genSettings.searchProvider, 'openrouter');
  assert.equal(genSettings.tutorEnabled, false);
  assert.equal(next.modelId, 'provider/new');
});

test('changed model: reasoning never carries over from the old snapshot', () => {
  const withoutChatReasoning = chatSettings({ generation: { temperature: 0.2 } });
  const { genSettings, chatSettings: next } = resolveRegenerationSettings({
    original: { genSettings: snapshot, model: 'provider/old' },
    settings: withoutChatReasoning,
    modelId: 'provider/new',
    supportsReasoning: true,
  });
  assert.equal(genSettings.reasoningEffort, undefined);
  assert.equal(genSettings.reasoningTokens, undefined);
  assert.equal(next.generation.reasoningEffort, undefined);

  const withChatReasoning = resolveRegenerationSettings({
    original: { genSettings: snapshot, model: 'provider/old' },
    settings: chatSettings(),
    modelId: 'provider/new',
    supportsReasoning: true,
  });
  assert.equal(withChatReasoning.genSettings.reasoningEffort, 'low');
  assert.equal(withChatReasoning.genSettings.reasoningTokens, 100);
});

test('a reply with no recorded model counts as a model change', () => {
  const { genSettings } = resolveRegenerationSettings({
    original: { genSettings: snapshot },
    settings: chatSettings(),
    modelId: 'provider/current',
    supportsReasoning: true,
  });
  assert.equal(genSettings.temperature, 0.2);
  assert.equal(genSettings.reasoningEffort, 'low');
});

test('a model without reasoning gets no reasoning values, from either side', () => {
  const { genSettings, chatSettings: next } = resolveRegenerationSettings({
    original: { genSettings: snapshot, model: 'provider/old' },
    settings: chatSettings(),
    modelId: 'provider/old',
    supportsReasoning: false,
  });
  assert.equal(genSettings.reasoningEffort, undefined);
  assert.equal(genSettings.reasoningTokens, undefined);
  // The chat's own value is left alone; only the reconciled ones are applied.
  assert.equal(next.generation.reasoningEffort, 'low');
});

test('invalid snapshot values fall through to the chat', () => {
  const { genSettings } = resolveRegenerationSettings({
    original: {
      genSettings: {
        temperature: '0.9',
        reasoningEffort: 'extreme',
        searchEnabled: 'yes',
      } as unknown as GenSettingsSnapshot,
      model: 'provider/old',
    },
    settings: chatSettings(),
    modelId: 'provider/old',
    supportsReasoning: true,
  });
  assert.equal(genSettings.temperature, 0.2);
  assert.equal(genSettings.reasoningEffort, 'low');
  assert.equal(genSettings.searchEnabled, false);
});

test('the retired brave provider becomes tavily', () => {
  const { genSettings } = resolveRegenerationSettings({
    original: { genSettings: { searchProvider: 'brave' }, model: 'provider/old' },
    settings: chatSettings(),
    modelId: 'provider/old',
    supportsReasoning: false,
  });
  assert.equal(genSettings.searchProvider, 'tavily');
});

test('provider sort comes only from a valid snapshot value', () => {
  const run = (providerSort: unknown) =>
    resolveRegenerationSettings({
      original: {
        genSettings: { providerSort } as GenSettingsSnapshot,
        model: 'provider/old',
      },
      settings: chatSettings({ generation: { providerSort: ProviderSort.Price } }),
      modelId: 'provider/old',
      supportsReasoning: false,
    });
  assert.equal(run(ProviderSort.Throughput).providerSort, ProviderSort.Throughput);
  assert.equal(run(ProviderSort.Throughput).genSettings.providerSort, ProviderSort.Throughput);
  assert.equal(run('fastest').providerSort, undefined);
  assert.equal(run(undefined).genSettings.providerSort, undefined);
});

test('a chat without tutor settings gains an explicit disabled tutor', () => {
  const settings = chatSettings();
  delete settings.features.tutor;
  const { chatSettings: next } = resolveRegenerationSettings({
    original: { model: 'provider/old' },
    settings,
    modelId: 'provider/old',
    supportsReasoning: false,
  });
  assert.deepEqual(next.features.tutor, { enabled: false });
  assert.equal(settings.features.tutor, undefined, 'input is not mutated');
});
