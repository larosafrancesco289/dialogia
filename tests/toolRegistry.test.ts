import { test } from 'node:test';
import assert from 'node:assert/strict';
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

const definition = (name: string): ToolDefinition => ({
  type: 'function',
  function: { name, description: name, parameters: { type: 'object', properties: {} } },
});

test('enabled modules register their tools by the time the barrel is imported', () => {
  assert.ok(isRegisteredTool('web_search'));
  assert.ok(isRegisteredTool('web_fetch'));
  assert.ok(isRegisteredTool('quiz'));

  assert.deepEqual(listTools({ module: 'core' }).sort(), ['web_fetch', 'web_search']);
  assert.ok(listTools({ module: 'tutor' }).includes('record_learning'));
});

test('kinds drive the scheduler predicates', () => {
  assert.equal(getToolKind('web_search'), 'action');
  assert.equal(isSearchTool('web_search'), true);
  assert.equal(isContentTool('quiz'), true);
  assert.equal(isMetaTool('record_learning'), true);
  assert.equal(isContentTool('record_learning'), false);
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
