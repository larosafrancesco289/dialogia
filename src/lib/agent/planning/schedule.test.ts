import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolCall } from '@/lib/agent/parsers';
import { schedulePlanningRound } from '@/lib/agent/planning/schedule';

test('schedulePlanningRound filters disallowed tutor tools', () => {
  const toolCalls = [
    createToolCall('quiz_mcq', { items: [] }, 'call-1'),
    createToolCall('quiz_fill_blank', { items: [] }, 'call-2'),
  ];

  const scheduled = schedulePlanningRound({
    toolCalls,
    allowedTutorTools: new Set(['quiz_mcq']),
    toolPolicy: { maxToolsPerTurn: 2, quizzesRemaining: 2 },
    phase: 'practice',
    currentPlan: undefined,
    searchEnabled: false,
    searchProvider: 'brave',
    usedTutorContentTool: false,
    quizCallsThisTurn: 0,
    maxToolsPerTurn: 2,
    toolsUsedThisTurn: 0,
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].function.name, 'quiz_mcq');
});

test('schedulePlanningRound enforces quiz budget', () => {
  const toolCalls = [createToolCall('quiz_mcq', { items: [] }, 'call-1')];

  const scheduled = schedulePlanningRound({
    toolCalls,
    allowedTutorTools: new Set(['quiz_mcq']),
    toolPolicy: { maxToolsPerTurn: 1, quizzesRemaining: 0 },
    phase: 'practice',
    currentPlan: undefined,
    searchEnabled: false,
    searchProvider: 'brave',
    usedTutorContentTool: false,
    quizCallsThisTurn: 0,
    maxToolsPerTurn: 1,
    toolsUsedThisTurn: 0,
  });

  assert.equal(scheduled.length, 0);
});
