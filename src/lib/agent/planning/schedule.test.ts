import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleRuntimes } from '@/lib/modules';
import { schedulePlanningRound } from '@/lib/agent/planning/schedule';
import type { ToolGate } from '@/lib/agent/planning/types';
import type { ToolCall } from '@/lib/agent/types';

const toolCall = (name: string, args: Record<string, unknown>, id: string): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

before(async () => {
  await loadModuleRuntimes();
});

const allowOnly = (allowed: string[], extra?: Partial<ToolGate>): ToolGate => ({
  isAllowed: (name) => allowed.includes(name),
  ...extra,
});

test('schedulePlanningRound drops calls the gate refuses', () => {
  const toolCalls = [
    toolCall('quiz', { type: 'mcq', items: [] }, 'call-1'),
    toolCall('learning_plan', { plan: {} }, 'call-2'),
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
    toolCall('quiz', { type: 'mcq', items: [] }, 'call-1'),
    toolCall('record_learning', {}, 'call-2'),
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
    toolCall('record_learning', {}, 'call-1'),
    toolCall('quiz', { type: 'mcq', items: [] }, 'call-2'),
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
