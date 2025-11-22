import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedulePlanningToolCalls } from '@/lib/agent/tools/scheduler';
import type { ToolCall } from '@/lib/agent/types';

const buildCall = (name: string): ToolCall => ({
  id: `${name}-1`,
  type: 'function',
  function: { name, arguments: '{}' },
});

test('scheduler keeps meta, one search, and one prioritized content tool', () => {
  const calls = [
    buildCall('web_search'),
    buildCall('quiz_mcq'),
    buildCall('quiz_fill_blank'),
    buildCall('assess_answer'),
  ];

  const scheduled = schedulePlanningToolCalls(calls, {
    hasPlan: true,
    hasActiveNode: true,
    phase: 'practice',
  });

  assert.equal(scheduled.length, 3);
  assert.deepEqual(
    scheduled.map((c) => c.function.name),
    ['assess_answer', 'web_search', 'quiz_mcq'],
  );
});

test('scheduler drops content when already used and search disabled', () => {
  const calls = [buildCall('web_search'), buildCall('create_diagnostic'), buildCall('update_learner_model')];

  const scheduled = schedulePlanningToolCalls(calls, {
    allowSearch: false,
    alreadyUsedContent: true,
    hasPlan: false,
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].function.name, 'update_learner_model');
});
