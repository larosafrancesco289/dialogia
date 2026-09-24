import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseToolArguments } from './parsers';

test('parseToolArguments reads serialized arguments back', () => {
  const args = parseToolArguments({
    id: 'call_lookup',
    type: 'function',
    function: { name: 'lookup', arguments: JSON.stringify({ query: 'saturn', count: 2 }) },
  });
  assert.deepEqual(args, { query: 'saturn', count: 2 });
});
