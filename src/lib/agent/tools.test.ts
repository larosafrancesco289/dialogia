import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlanningToolCalls } from '@/lib/agent/tools';
import { loadModuleRuntimes } from '@/lib/modules';
import { extractWebSearchArgs } from '@/lib/search';
import { parseJsonAfter } from '@/lib/tools/json';
import type { AssistantModelMessage, ToolCall, ToolDefinition } from '@/lib/agent/types';

// Inline tool-call detection asks the registry which names to look for.
before(async () => {
  await loadModuleRuntimes();
});

test('extractWebSearchArgs finds inline JSON payloads', () => {
  const content = 'Let me call web_search with {"query":"latest news","count":3}.';
  const args = extractWebSearchArgs(content);
  assert.deepEqual(args, { query: 'latest news', count: 3 });
});

test('extractWebSearchArgs unwraps function-style payloads', () => {
  const content =
    'Calling function {"name":"web_search","arguments":"{\\"query\\":\\"open router\\"}"}';
  const args = extractWebSearchArgs(content);
  assert.deepEqual(args, { query: 'open router' });
});

test('parseJsonAfter extracts nested JSON payloads', () => {
  const content = 'prefix {"name":"web_search","arguments":{"query":"mars","count":2}} suffix';
  const parsed = parseJsonAfter(content, content.indexOf('{'));
  assert.ok(parsed);
  if (!parsed) return;
  assert.equal((parsed.value as any)?.name, 'web_search');
  assert.equal((parsed.value as any)?.arguments?.query, 'mars');
});

test('detectPlanningToolCalls returns provided tool_calls before inline hints', () => {
  const message: Partial<AssistantModelMessage> = {
    tool_calls: [
      {
        id: 'abc',
        type: 'function',
        function: { name: 'web_search', arguments: '{"query":"mars"}' },
      } satisfies ToolCall,
    ],
  };
  const calls = detectPlanningToolCalls({
    message,
    toolDefinition: [],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'abc');
});

test('detectPlanningToolCalls synthesizes inline content-tool calls and respects tool definitions', () => {
  const toolDefinition: ToolDefinition[] = [
    { type: 'function', function: { name: 'give_quiz', parameters: {} } },
  ];
  const message = {
    content: 'give_quiz: {"items":[{"question":"1+1?","choices":["1","2"],"correct":1}]}',
  };
  const calls = detectPlanningToolCalls({
    message,
    toolDefinition,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.name, 'give_quiz');
});
