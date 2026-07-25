import { test } from 'node:test';
import assert from 'node:assert/strict';
import '@/lib/tools';
import { schedulePlanningToolCalls } from '@/lib/agent/tools/scheduler';
import { buildTutorContentPriority } from '@/lib/agent/tools/tutor/contentPriority';
import type { ToolCall } from '@/lib/agent/types';

const buildCall = (name: string, args = '{}', id = `${name}-1`): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: args },
});

test('scheduler keeps meta, one search, and one prioritized content tool', () => {
  const calls = [buildCall('web_search'), buildCall('quiz'), buildCall('record_learning')];

  const scheduled = schedulePlanningToolCalls(calls, {
    contentPriority: buildTutorContentPriority({
      phase: 'practice',
      hasPlan: true,
      hasActiveNode: true,
    }),
  });

  assert.equal(scheduled.length, 3);
  assert.deepEqual(
    scheduled.map((c) => c.function.name),
    ['record_learning', 'web_search', 'quiz'],
  );
});

test('scheduler asks the active module which content tool wins', () => {
  const calls = [buildCall('quiz'), buildCall('learning_plan')];

  const scheduled = schedulePlanningToolCalls(calls, {
    contentPriority: (candidates) => [...candidates].sort(),
  });

  assert.deepEqual(
    scheduled.map((c) => c.function.name),
    ['learning_plan'],
  );
});

test('scheduler keeps parallel searches up to the cap and dedupes identical queries', () => {
  const calls = [
    buildCall('web_search', '{"query":"a"}', 'ws-1'),
    buildCall('web_search', '{"query":"b"}', 'ws-2'),
    buildCall('web_search', '{"query":"b"}', 'ws-3'),
    buildCall('web_search', '{"query":"c"}', 'ws-4'),
    buildCall('web_search', '{"query":"d"}', 'ws-5'),
  ];

  const scheduled = schedulePlanningToolCalls(calls, {});

  assert.deepEqual(
    scheduled.map((c) => c.id),
    ['ws-1', 'ws-2', 'ws-4'],
  );
});

test('scheduler drops content when already used and search disabled', () => {
  const calls = [
    buildCall('web_search'),
    buildCall('create_diagnostic'),
    buildCall('record_learning'),
  ];

  const scheduled = schedulePlanningToolCalls(calls, {
    allowSearch: false,
    alreadyUsedContent: true,
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].function.name, 'record_learning');
});

test('unregistered tools fall through as ordinary calls', () => {
  const scheduled = schedulePlanningToolCalls([buildCall('some_future_tool')], {});
  assert.deepEqual(
    scheduled.map((c) => c.function.name),
    ['some_future_tool'],
  );
});
