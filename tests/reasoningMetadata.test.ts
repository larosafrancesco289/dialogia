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
import { resolveDynamicModelId } from '@/lib/models/dynamicDefaults';
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

test('~anthropic/frontier prefers the Mythos-class family over pricier Opus', () => {
  const models = [
    orModel('anthropic/claude-opus-4-8', { completion: 0.00009, created: 200 }),
    orModel('anthropic/claude-fable-5', { completion: 0.00005, created: 100 }),
    orModel('anthropic/claude-haiku-4-5', { completion: 0.000005, created: 300 }),
  ];
  assert.equal(resolveDynamicModelId('~anthropic/frontier', models), 'anthropic/claude-fable-5');
});

test('~openai/gpt-latest picks the newest mainline GPT, skipping pro and mini', () => {
  const models = [
    orModel('openai/gpt-5.5', { created: 100 }),
    orModel('openai/gpt-6', { created: 300 }),
    orModel('openai/gpt-6-pro', { created: 400 }),
    orModel('openai/gpt-6-mini', { created: 350 }),
  ];
  assert.equal(resolveDynamicModelId('~openai/gpt-latest', models), 'openai/gpt-6');
});

test('dynamic aliases fall back to their pins and pass concrete ids through', () => {
  assert.equal(resolveDynamicModelId('~anthropic/frontier', []), 'anthropic/claude-fable-5');
  assert.equal(resolveDynamicModelId('~openai/gpt-latest', []), 'openai/gpt-5.5');
  assert.equal(resolveDynamicModelId('openai/gpt-5.5', []), 'openai/gpt-5.5');
  // OpenRouter's own tilde alias models are real ids and pass through.
  assert.equal(
    resolveDynamicModelId('~anthropic/claude-fable-latest', []),
    '~anthropic/claude-fable-latest',
  );
});
