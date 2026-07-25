import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleRuntimes } from '@/lib/modules';
import { createToolCall } from '@/lib/agent/parsers';
import { schedulePlanningRound } from '@/lib/agent/planning/schedule';
import type { ToolGate } from '@/lib/agent/planning/types';

before(async () => {
  await loadModuleRuntimes();
});

const allowOnly = (allowed: string[], extra?: Partial<ToolGate>): ToolGate => ({
  isAllowed: (name) => allowed.includes(name),
  ...extra,
});

test('schedulePlanningRound drops calls the gate refuses', () => {
  const toolCalls = [
    createToolCall('quiz', { type: 'mcq', items: [] }, 'call-1'),
    createToolCall('learning_plan', { plan: {} }, 'call-2'),
  ];

  const scheduled = schedulePlanningRound({
    toolCalls,
    gate: allowOnly(['quiz'], { maxToolsPerTurn: 2 }),
    searchEnabled: false,
    searchProvider: 'tavily',
    usedContentTool: false,
    toolsUsedThisTurn: 0,
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].function.name, 'quiz');
});

test('schedulePlanningRound stops the round when the gate says stop', () => {
  const toolCalls = [
    createToolCall('quiz', { type: 'mcq', items: [] }, 'call-1'),
    createToolCall('record_learning', {}, 'call-2'),
  ];

  const scheduled = schedulePlanningRound({
    toolCalls,
    gate: allowOnly([], { onBudgetExceeded: () => 'stop' }),
    searchEnabled: false,
    searchProvider: 'tavily',
    usedContentTool: false,
    toolsUsedThisTurn: 0,
  });

  assert.equal(scheduled.length, 0);
});

test('schedulePlanningRound honours the per-turn cap and reports what it scheduled', () => {
  const toolCalls = [
    createToolCall('record_learning', {}, 'call-1'),
    createToolCall('quiz', { type: 'mcq', items: [] }, 'call-2'),
  ];
  const seen: string[] = [];

  const scheduled = schedulePlanningRound({
    toolCalls,
    gate: allowOnly(['quiz', 'record_learning'], {
      maxToolsPerTurn: 2,
      onScheduled: (name) => seen.push(name),
    }),
    searchEnabled: false,
    searchProvider: 'tavily',
    usedContentTool: false,
    toolsUsedThisTurn: 1,
  });

  assert.equal(scheduled.length, 1);
  assert.deepEqual(seen, ['record_learning']);
});
