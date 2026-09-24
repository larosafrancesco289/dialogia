import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampReasoningEffort,
  getDefaultReasoningEffort,
  getModelReasoningInfo,
  getSelectableReasoningEfforts,
  isReasoningMandatory,
  supportsXhighReasoningEffort,
} from '@/lib/models/capabilities';
import { resolveDynamicModelId, resolveFirstAvailableModelId } from '@/lib/models/dynamicDefaults';
import type { ModelDescriptor } from '@/lib/types';

const buildModel = (id: string, raw: Record<string, unknown>): ModelDescriptor => ({
  id,
  name: id,
  raw: { supported_parameters: ['reasoning'], ...raw },
});

const FABLE_OR = buildModel('anthropic/claude-fable-5', {
  reasoning: {
    supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'],
    default_effort: 'high',
    default_enabled: true,
    mandatory: true,
  },
});

const CAPPED_MODEL = buildModel('provider/capped', {
  reasoning: {
    supported_efforts: ['high', 'medium', 'low'],
    default_effort: 'medium',
    default_enabled: true,
    mandatory: false,
  },
});

const OFF_BY_DEFAULT = buildModel('provider/off-by-default', {
  reasoning: {
    supported_efforts: ['high', 'medium', 'low'],
    default_effort: 'medium',
    default_enabled: false,
    mandatory: false,
  },
});

test('getModelReasoningInfo normalizes the OpenRouter reasoning object', () => {
  const info = getModelReasoningInfo(FABLE_OR);
  assert.deepEqual(info?.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(info?.defaultEffort, 'high');
  assert.equal(info?.mandatory, true);
});

test('selectable efforts follow metadata and drop none for mandatory reasoning', () => {
  assert.deepEqual(getSelectableReasoningEfforts(FABLE_OR), [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ]);
  assert.deepEqual(getSelectableReasoningEfforts(CAPPED_MODEL), ['none', 'low', 'medium', 'high']);
  assert.equal(isReasoningMandatory(FABLE_OR), true);
});

test('xhigh support comes from metadata, with legacy id fallback', () => {
  assert.equal(supportsXhighReasoningEffort(FABLE_OR), true);
  assert.equal(supportsXhighReasoningEffort(CAPPED_MODEL), false);
  // No reasoning object: fall back to known-model id patterns.
  assert.equal(supportsXhighReasoningEffort(buildModel('anthropic/claude-fable-5', {})), true);
  assert.equal(supportsXhighReasoningEffort(buildModel('provider/other', {})), false);
});

test('provider default effort respects default_enabled', () => {
  assert.equal(getDefaultReasoningEffort(FABLE_OR), 'high');
  assert.equal(getDefaultReasoningEffort(CAPPED_MODEL), 'medium');
  assert.equal(getDefaultReasoningEffort(OFF_BY_DEFAULT), 'none');
  assert.equal(getDefaultReasoningEffort(buildModel('provider/no-meta', {})), undefined);
});

test("Anthropic's documented default (high) beats OpenRouter's gateway medium", () => {
  // OpenRouter really publishes default_effort "medium" for Claude models;
  // the model author's documented default is high.
  const fableGatewayMedium = buildModel('anthropic/claude-fable-5', {
    reasoning: {
      supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'],
      default_effort: 'medium',
      mandatory: true,
    },
  });
  assert.equal(getDefaultReasoningEffort(fableGatewayMedium), 'high');
});

test('clampReasoningEffort steps to the nearest supported level', () => {
  assert.equal(clampReasoningEffort('xhigh', CAPPED_MODEL), 'high');
  assert.equal(clampReasoningEffort('minimal', CAPPED_MODEL), 'low');
  // Mandatory reasoning: 'none' clamps up to the weakest supported level.
  assert.equal(clampReasoningEffort('none', FABLE_OR), 'low');
  // Legacy metadata without a reasoning object keeps the old xhigh demotion.
  assert.equal(clampReasoningEffort('xhigh', buildModel('provider/no-meta', {})), 'high');
  // Unknown model (index still hydrating): value passes through untouched.
  assert.equal(clampReasoningEffort('xhigh', undefined), 'xhigh');
});

const orModel = (
  id: string,
  opts: { completion?: number; created?: number } = {},
): ModelDescriptor => ({
  id,
  name: id,
  pricing: { prompt: 0.000001, completion: opts.completion ?? 0.00001, currency: 'usd' },
  raw: { created: opts.created ?? 0 },
});

const alias = (id: string, target: string): ModelDescriptor => ({
  id,
  name: id,
  raw: { alias_target: { slug: target, name: target } },
});

test("a family resolves to the model OpenRouter's alias points to", () => {
  const models = [
    orModel('openai/gpt-6-sol', { created: 300 }),
    orModel('openai/gpt-6-luna', { created: 301 }),
    alias('~openai/gpt-sol-latest', 'openai/gpt-6-sol'),
  ];
  assert.equal(resolveDynamicModelId('~openai/gpt-sol-latest', models), 'openai/gpt-6-sol');
});

test('without the alias entry, a family resolves by name to its newest member', () => {
  const models = [
    orModel('anthropic/claude-opus-5', { created: 100 }),
    orModel('anthropic/claude-opus-5.5', { created: 300 }),
    orModel('anthropic/claude-opus-5.5:batch', { created: 400 }),
    orModel('anthropic/claude-fable-5.1', { created: 500 }),
    orModel('openai/gpt-6-luna-pro', { created: 600 }),
    orModel('openai/gpt-6-luna', { created: 200 }),
  ];
  assert.equal(
    resolveDynamicModelId('~anthropic/claude-opus-latest', models),
    'anthropic/claude-opus-5.5',
  );
  assert.equal(resolveDynamicModelId('~openai/gpt-luna-latest', models), 'openai/gpt-6-luna');
});

test('on a Claude API key a family resolves among its newest-first list', () => {
  const direct = (id: string, created_at: string): ModelDescriptor => ({
    id: `anthropic-direct/${id}`,
    name: id,
    raw: { created_at },
  });
  const models = [
    direct('claude-opus-5-5', '2026-09-22T00:00:00Z'),
    direct('claude-haiku-4-5-20251001', '2025-10-01T00:00:00Z'),
    direct('claude-opus-5', '2026-07-24T00:00:00Z'),
  ];
  assert.equal(
    resolveDynamicModelId('~anthropic/claude-opus-latest', models),
    'anthropic-direct/claude-opus-5-5',
  );
  assert.equal(
    resolveDynamicModelId('~anthropic/claude-haiku-latest', models),
    'anthropic-direct/claude-haiku-4-5-20251001',
  );
});

test("the app's retired aliases map to families, and pins cover an empty list", () => {
  // Which model each pin names changes with every release; that it is a
  // concrete id from the alias's own provider does not.
  for (const [alias, provider] of [
    ['~openai/gpt-latest', 'openai'],
    ['~anthropic/frontier', 'anthropic'],
    ['~x-ai/grok-latest', 'x-ai'],
  ]) {
    assert.match(resolveDynamicModelId(alias, []), new RegExp(`^${provider}/[^~]+$`), alias);
  }
  assert.equal(resolveDynamicModelId('openai/gpt-5.5', []), 'openai/gpt-5.5');
  // An alias the app does not know is a provider's own requestable id.
  assert.equal(
    resolveDynamicModelId('~deepseek/deepseek-pro-latest', []),
    '~deepseek/deepseek-pro-latest',
  );
});

test('the first available preference wins, and a custom server is the last resort', () => {
  const builtIn = (id: string) => id === 'openrouter' || id === 'anthropic';
  const custom = { ...orModel('mine/local'), endpointId: 'mine' };
  const opus = { ...orModel('anthropic-direct/claude-opus-5-5'), endpointId: 'anthropic' };
  assert.equal(
    resolveFirstAvailableModelId(
      ['~openai/gpt-luna-latest', '~anthropic/claude-opus-latest'],
      [custom, opus],
      builtIn,
    ),
    'anthropic-direct/claude-opus-5-5',
  );
  const sonnet = { ...orModel('anthropic-direct/claude-sonnet-5'), endpointId: 'anthropic' };
  assert.equal(
    resolveFirstAvailableModelId(['~openai/gpt-luna-latest'], [custom, sonnet], builtIn),
    'anthropic-direct/claude-sonnet-5',
  );
  assert.equal(
    resolveFirstAvailableModelId(['~openai/gpt-luna-latest'], [custom], builtIn),
    'mine/local',
  );
});
