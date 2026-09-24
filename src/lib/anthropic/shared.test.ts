import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  documentedAnthropicEffortLevels,
  isAnthropicThinkingMandatory,
  resolveAnthropicDirectModelId,
  supportsAnthropicPromptCaching,
} from '@/lib/anthropic/shared';

test('capabilities follow the generation in the id, not a list of ids', () => {
  assert.equal(supportsAnthropicPromptCaching('claude-opus-5-5'), true);
  assert.equal(supportsAnthropicPromptCaching('claude-3-haiku-20240307'), true);
  assert.equal(supportsAnthropicPromptCaching('claude-2-1'), false);
  assert.deepEqual(documentedAnthropicEffortLevels('claude-sonnet-4-6'), [
    'low',
    'medium',
    'high',
    'max',
  ]);
  assert.deepEqual(documentedAnthropicEffortLevels('claude-opus-5-5'), [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ]);
  assert.deepEqual(documentedAnthropicEffortLevels('claude-haiku-4-5-20251001'), [
    'low',
    'medium',
    'high',
  ]);
  assert.equal(isAnthropicThinkingMandatory('claude-fable-5-1'), true);
  assert.equal(isAnthropicThinkingMandatory('claude-opus-5-5'), true);
  assert.equal(isAnthropicThinkingMandatory('claude-opus-5'), false);
  assert.equal(isAnthropicThinkingMandatory('claude-sonnet-5'), false);
});

test('resolveAnthropicDirectModelId applies each of its rules', () => {
  const cases: Array<[string, string | undefined]> = [
    ['claude-sonnet-4-5', 'claude-sonnet-4-5-20250929'], // alias map hit
    ['claude-opus-4.8', 'claude-opus-4-8'], // dotted variant of a mapped alias
    ['anthropic-direct/claude-opus-4-7', 'claude-opus-4-7'], // provider prefix stripped
    ['claude-3-haiku-20240307', 'claude-3-haiku-20240307'], // snapshot id passes through
    ['claude-sonnet-5', undefined], // unknown alias
  ];
  for (const [input, expected] of cases) {
    assert.equal(resolveAnthropicDirectModelId(input), expected, input);
  }
});
