import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolCall, normalizeToolCalls, parseToolArguments } from './parsers';

test('normalizeToolCalls extracts OpenAI style tool_calls', () => {
  const message = {
    tool_calls: [
      {
        id: 'call_123',
        type: 'function',
        function: { name: 'web_search', arguments: '{"query":"mars"}' },
      },
    ],
  };
  const normalized = normalizeToolCalls(message);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.id, 'call_123');
  assert.equal(normalized[0]?.function.name, 'web_search');
});

test('normalizeToolCalls lifts legacy function_call payloads', () => {
  const message = {
    function_call: {
      name: 'web_search',
      arguments: '{"query":"venus"}',
    },
  };
  const normalized = normalizeToolCalls(message);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.function.name, 'web_search');
  assert.equal(normalized[0]?.function.arguments, '{"query":"venus"}');
});

test('createToolCall serializes arguments and parseToolArguments reads them back', () => {
  const call = createToolCall('lookup', { query: 'saturn', count: 2 }, 'call_lookup');
  assert.equal(call.function.arguments.includes('"query":"saturn"'), true);
  const args = parseToolArguments(call);
  assert.deepEqual(args, { query: 'saturn', count: 2 });
});
