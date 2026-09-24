import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  documentedAnthropicEffortLevels,
  isAnthropicThinkingMandatory,
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
