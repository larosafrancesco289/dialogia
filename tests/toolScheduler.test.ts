import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleRuntimes } from '@/lib/modules';
import { schedulePlanningToolCalls } from '@/lib/agent/tools/scheduler';
import type { ToolCall } from '@/lib/agent/types';

before(async () => {
  await loadModuleRuntimes();
});

const buildCall = (name: string, args = '{}', id = `${name}-1`): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: args },
});

test('scheduler keeps searches, then actions, then one content tool last', () => {
  const calls = [
    buildCall('give_quiz'),
    buildCall('web_search'),
    buildCall('start_topic'),
    buildCall('ask_intake'),
    buildCall('record_evidence'),
  ];

  const scheduled = schedulePlanningToolCalls(calls, {});

  // A card waits for the learner, so it runs after the round's state changes
  // (start a topic, then quiz it); a second card in the round is dropped.
  assert.deepEqual(
    scheduled.map((c) => c.function.name),
    ['web_search', 'start_topic', 'record_evidence', 'give_quiz'],
  );
});

test('scheduler asks the active module which content tool wins', () => {
  const calls = [buildCall('give_quiz'), buildCall('propose_plan')];

  const scheduled = schedulePlanningToolCalls(calls, {
    contentPriority: (candidates) => [...candidates].sort().reverse(),
  });

  assert.deepEqual(
    scheduled.map((c) => c.function.name),
    ['propose_plan'],
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
    buildCall('give_diagnostic'),
    buildCall('record_evidence'),
  ];

  const scheduled = schedulePlanningToolCalls(calls, {
    allowSearch: false,
    alreadyUsedContent: true,
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].function.name, 'record_evidence');
});

test('unregistered tools fall through as ordinary calls', () => {
  const scheduled = schedulePlanningToolCalls([buildCall('some_future_tool')], {});
  assert.deepEqual(
    scheduled.map((c) => c.function.name),
    ['some_future_tool'],
  );
});
