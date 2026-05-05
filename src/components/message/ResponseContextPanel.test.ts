import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderedResponseActivity } from './ResponseContextPanel';
import type { MessageActivityItem, ToolCallLogEntry } from '@/lib/types';

test('keeps persisted tool calls visible when reasoning activity already exists', () => {
  const activity: MessageActivityItem[] = [
    {
      id: 'thought-1',
      type: 'reasoning',
      text: 'I should search for a current answer.',
      timestamp: 100,
      status: 'done',
    },
  ];
  const toolCalls: ToolCallLogEntry[] = [
    {
      id: 'tool-1',
      name: 'web_search',
      timestamp: 200,
      status: 'success',
      input: { query: 'current US president May 2026' },
      output: { query: 'current US president May 2026', resultsPreview: [] },
      category: 'search',
      metadata: { provider: 'tavily', results: 2 },
    },
  ];

  const result = buildOrderedResponseActivity({
    activity,
    reasoning: '',
    toolCalls,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.type, 'reasoning');
  assert.equal(result[1]?.type, 'tool_call');
  assert.equal(result[1]?.id, 'tool-1');
});

test('represents Tavily source state as a web search tool when no tool log is present', () => {
  const result = buildOrderedResponseActivity({
    activity: [
      {
        id: 'thought-1',
        type: 'reasoning',
        text: 'I should search for a current answer.',
        timestamp: 100,
        status: 'done',
      },
    ],
    reasoning: '',
    toolCalls: [],
    sources: {
      query: 'current US president May 2026',
      status: 'done',
      results: [
        {
          title: 'Example source',
          url: 'https://example.com',
          description: 'A source result.',
        },
      ],
    },
  });

  const sourceTool = result.find((item) => item.type === 'tool_call');
  assert.ok(sourceTool);
  assert.equal(sourceTool.name, 'web_search');
  assert.equal(sourceTool.status, 'success');
  assert.equal(sourceTool.metadata?.provider, 'tavily');
  assert.equal(sourceTool.metadata?.results, 1);
});
