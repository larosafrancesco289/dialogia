import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anthropicThinkingOff,
  anthropicWebSearchMode,
  documentedAnthropicDefaultEffort,
  documentedAnthropicEffortLevels,
  getAnthropicPricing,
  isAnthropicThinkingMandatory,
  readAnthropicModelFacts,
  rememberAnthropicModelFacts,
  resetAnthropicModelFactsForTest,
  resolveAnthropicDirectModelId,
  supportsAnthropicAdaptiveThinking,
  supportsAnthropicBudgetThinking,
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
  assert.equal(isAnthropicThinkingMandatory('claude-haiku-5-5'), false);
  assert.deepEqual(documentedAnthropicEffortLevels('claude-haiku-5-5'), [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ]);
  assert.equal(supportsAnthropicPromptCaching('claude-haiku-5-5'), true);
  assert.deepEqual(anthropicThinkingOff('claude-haiku-5-5'), { type: 'disabled' });
});

test('Claude Haiku 5.5 runs at medium effort by default and has a price', () => {
  assert.equal(documentedAnthropicDefaultEffort('claude-haiku-5-5'), 'medium');
  assert.equal(documentedAnthropicDefaultEffort('anthropic/claude-haiku-5.5'), 'medium');
  assert.equal(documentedAnthropicDefaultEffort('claude-opus-5-5'), 'medium');
  assert.equal(documentedAnthropicDefaultEffort('claude-sonnet-5-5'), 'high');
  assert.equal(documentedAnthropicDefaultEffort('claude-haiku-4-5'), 'high');
  assert.equal(getAnthropicPricing('anthropic-direct/claude-haiku-5-5')?.prompt, 0.0000001);
  assert.equal(getAnthropicPricing('claude-haiku-5-5')?.completion, 0.0000005);
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

test('the Models API’s flags decide over the id, and the id answers where they are missing', (t) => {
  t.after(resetAnthropicModelFactsForTest);
  const entry = (id: string, line: string | null, caps: Record<string, unknown>) =>
    rememberAnthropicModelFacts(id, readAnthropicModelFacts({ id, line, capabilities: caps }));
  const on = { supported: true };
  const off = { supported: false };

  // An id the rules cannot read: the flags alone say how to turn thinking off.
  entry('claude-nova-preview', 'opus', {
    thinking: { supported: true, types: { adaptive: on, enabled: off, disabled: on } },
    server_tools: { supported: true, web_search: on, code_execution: on },
    code_execution: on,
  });
  assert.deepEqual(anthropicThinkingOff('claude-nova-preview'), { type: 'disabled' });
  assert.equal(supportsAnthropicAdaptiveThinking('claude-nova-preview'), true);
  assert.equal(supportsAnthropicBudgetThinking('claude-nova-preview'), false);
  assert.equal(anthropicWebSearchMode('claude-nova-preview'), 'filtered');

  // A model that refuses "disabled" is never sent it, whatever its id suggests.
  entry('claude-haiku-5-5', 'haiku', { thinking: { supported: true, types: { disabled: off } } });
  assert.equal(anthropicThinkingOff('claude-haiku-5-5'), undefined);
  assert.equal(isAnthropicThinkingMandatory('claude-haiku-5-5'), true);
  // A budget is offered only where adaptive thinking is not: 4.6 still takes one, deprecated.
  entry('claude-opus-4-6', 'opus', {
    thinking: { supported: true, types: { adaptive: on, enabled: on, disabled: on } },
  });
  assert.equal(supportsAnthropicBudgetThinking('claude-opus-4-6'), false);
  // Sonnet 5.5 refuses it too, and still turns up-front thinking off its own way.
  entry('claude-sonnet-5-5', 'sonnet', { thinking: { supported: true, types: { disabled: off } } });
  assert.deepEqual(anthropicThinkingOff('claude-sonnet-5-5'), { type: 'between_tools' });
  assert.equal(isAnthropicThinkingMandatory('claude-sonnet-5-5'), false);
  // And one that accepts it is never called mandatory.
  entry('claude-opus-5-5', 'opus', { thinking: { supported: true, types: { disabled: on } } });
  assert.equal(isAnthropicThinkingMandatory('claude-opus-5-5'), false);
  assert.deepEqual(anthropicThinkingOff('claude-opus-5-5'), { type: 'disabled' });

  // `line` names the model's line, not the id: an Opus-line 5.5 defaults to medium effort.
  entry('claude-orca-5-5', 'opus', {});
  assert.equal(documentedAnthropicDefaultEffort('claude-orca-5-5'), 'medium');

  // Web search: the flags say which tool, or none at all.
  entry('claude-opus-4-5-20251101', 'opus', { code_execution: on });
  assert.equal(anthropicWebSearchMode('claude-opus-4-5'), 'filtered');
  entry('claude-sonnet-4-6', 'sonnet', { code_execution: off });
  assert.equal(anthropicWebSearchMode('claude-sonnet-4-6'), 'direct');
  entry('claude-haiku-4-5-20251001', 'haiku', { server_tools: { web_search: off } });
  assert.equal(anthropicWebSearchMode('claude-haiku-4-5'), 'none');

  // A response without the flags leaves the id rules in charge.
  entry('claude-sonnet-5', null, {});
  assert.deepEqual(anthropicThinkingOff('claude-sonnet-5'), { type: 'disabled' });
  assert.equal(anthropicWebSearchMode('claude-sonnet-5'), 'filtered');
  assert.equal(anthropicWebSearchMode('claude-sonnet-4-5'), 'direct');
  assert.equal(anthropicWebSearchMode('claude-fable-5-1'), 'filtered');
  assert.equal(anthropicWebSearchMode('claude-3-7-sonnet-latest'), 'basic');
});
