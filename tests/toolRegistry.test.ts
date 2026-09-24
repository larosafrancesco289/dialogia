import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleRuntimes } from '@/lib/modules';
import {
  getTool,
  getToolKind,
  getToolLogCategory,
  isContentTool,
  isMetaTool,
  isRegisteredTool,
  isSearchTool,
  listTools,
  registerTool,
  unregisterTool,
} from '@/lib/tools';
import type { ToolDefinition } from '@/lib/transport/contracts';
import { TOOL_ENDS_TURN, TUTOR_TOOLS, TUTOR_TOOL_NAMES } from '@/modules/tutor/engine';

before(async () => {
  await loadModuleRuntimes();
});

const definition = (name: string): ToolDefinition => ({
  type: 'function',
  function: { name, description: name, parameters: { type: 'object', properties: {} } },
});

test("loadModuleRuntimes registers every enabled module's tools", () => {
  assert.ok(isRegisteredTool('web_search'));
  assert.ok(isRegisteredTool('web_fetch'));
  assert.ok(isRegisteredTool('give_quiz'));

  assert.deepEqual(listTools({ module: 'core' }).sort(), ['web_fetch', 'web_search']);
});

test('every tutor engine tool is registered, and nothing else under the tutor', () => {
  assert.deepEqual(listTools({ module: 'tutor' }).sort(), [...TUTOR_TOOL_NAMES].sort());
  for (const name of TUTOR_TOOL_NAMES) {
    const entry = getTool(name);
    assert.ok(entry?.handler, `${name} has a handler`);
    assert.deepEqual(entry?.definition, TUTOR_TOOLS[name]);
  }
});

test('tutor cards are content tools, state tools are actions, and every round replays', () => {
  for (const name of TUTOR_TOOL_NAMES) {
    const metadata = getTool(name)?.metadata;
    assert.equal(metadata?.kind, TOOL_ENDS_TURN[name] ? 'content' : 'action', name);
    assert.equal(metadata?.replay, true, name);
    assert.equal(metadata?.logCategory, 'tutor', name);
  }
  assert.deepEqual(TUTOR_TOOL_NAMES.filter((name) => TOOL_ENDS_TURN[name]).sort(), [
    'ask_intake',
    'give_diagnostic',
    'give_quiz',
    'propose_plan',
  ]);
});

test('kinds drive the scheduler predicates', () => {
  assert.equal(getToolKind('web_search'), 'action');
  assert.equal(isSearchTool('web_search'), true);
  assert.equal(isContentTool('give_quiz'), true);
  assert.equal(getToolKind('record_evidence'), 'action');
  assert.equal(isContentTool('record_evidence'), false);
  assert.equal(isMetaTool('record_evidence'), false);
});

test('unknown names are inert rather than throwing', () => {
  assert.equal(getTool('nope'), undefined);
  assert.equal(getToolKind('nope'), undefined);
  assert.equal(isSearchTool('nope'), false);
  assert.equal(getToolLogCategory('nope'), 'other');
});

test('a third-party module can register and unregister its own tool', () => {
  registerTool('my_tool', {
    definition: definition('my_tool'),
    metadata: { module: 'demo', kind: 'content', logCategory: 'planning', ext: { anything: 1 } },
  });

  assert.deepEqual(listTools({ module: 'demo' }), ['my_tool']);
  assert.equal(isContentTool('my_tool'), true);
  assert.equal(getToolLogCategory('my_tool'), 'planning');

  unregisterTool('my_tool');
  assert.equal(isRegisteredTool('my_tool'), false);
});
