import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderedResponseActivity,
  currentThoughtLine,
  formatThinkingTime,
  summarizeActivity,
} from '@/lib/ui/responseActivity';
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

test('the live line is the latest finished sentence, not the one being written', () => {
  assert.equal(currentThoughtLine('The user asks about memory'), '');
  assert.equal(
    currentThoughtLine('The user asks about memory. I should cover recall and'),
    'The user asks about memory.',
  );
  assert.equal(
    currentThoughtLine('First point. Second **point** here.\n\nThird'),
    'Second point here.',
  );
});

test('the live line prefers the latest titled section when reasoning has them', () => {
  const text =
    '**Weighing the question**\n\nSome thought. More.\n\n**Planning the answer**\n\nA list';
  assert.equal(currentThoughtLine(text), 'Planning the answer');
});

test('thinking time reads in words', () => {
  assert.equal(formatThinkingTime(300), '1 second');
  assert.equal(formatThinkingTime(8_400), '8 seconds');
  assert.equal(formatThinkingTime(60_000), '1 minute');
  assert.equal(formatThinkingTime(72_000), '1 minute 12 seconds');
});

test('the summary at rest counts thinking time and searches', () => {
  const orderedActivity = buildOrderedResponseActivity({
    activity: [
      {
        id: 'thought-1',
        type: 'reasoning',
        text: 'Look it up.',
        timestamp: 100,
        status: 'done',
        duration: 8_400,
      },
    ],
    reasoning: '',
    toolCalls: [
      {
        id: 'tool-1',
        name: 'web_search',
        timestamp: 200,
        status: 'success',
        input: { query: 'memory' },
      },
    ],
  });
  const summary = summarizeActivity({
    orderedActivity,
    toolCalls: [],
    reasoning: '',
    isLive: false,
  });
  assert.equal(summary, '8 seconds, 1 search');
});

test('the summary names a running tool and, while live, the line of thought', () => {
  const pending: ToolCallLogEntry = {
    id: 'tool-1',
    name: 'web_search',
    timestamp: 200,
    status: 'pending',
    input: { query: 'memory' },
  };
  const withTool = buildOrderedResponseActivity({ reasoning: '', toolCalls: [pending] });
  assert.equal(
    summarizeActivity({
      orderedActivity: withTool,
      toolCalls: [pending],
      reasoning: '',
      isLive: true,
    }),
    'Searching the web',
  );
  const thinking = buildOrderedResponseActivity({ reasoning: 'First point. Second' });
  assert.equal(
    summarizeActivity({
      orderedActivity: thinking,
      toolCalls: [],
      reasoning: 'First point. Second',
      isLive: true,
    }),
    'First point.',
  );
});
