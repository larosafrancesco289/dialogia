import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderedResponseActivity,
  currentThoughtLine,
  formatThinkingTime,
  silentWaitLine,
  summarizeActivity,
  toolAnnotation,
  toolDisplayName,
  toolObject,
  type ToolActivityItem,
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
  assert.equal(currentThoughtLine('The fine is \\$6.66. Then'), 'The fine is $6.66.');
  assert.equal(currentThoughtLine('Wait... v2.1 is out! Then'), 'v2.1 is out!');
  assert.equal(
    currentThoughtLine('Think of vectors, e.g. arrows. Ask Dr. Jones about the U.S. economy. Then'),
    'Ask Dr. Jones about the U.S. economy.',
  );
  assert.equal(
    currentThoughtLine('Use *italics* and [a link](https://x.test) here. Then'),
    'Use italics and a link here.',
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
  assert.equal(summary, 'for 8 seconds, 1 search');
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
  // Between rounds, with no line of thought yet, no filler: the head's "Thinking" speaks alone.
  const done = { ...pending, id: 'done', status: 'success' as const };
  assert.equal(
    summarizeActivity({
      orderedActivity: buildOrderedResponseActivity({ reasoning: '', toolCalls: [done] }),
      toolCalls: [done],
      reasoning: '',
      isLive: true,
    }),
    '',
  );
});

test("the app's own tools read in plain words, and a running one names its object", () => {
  assert.equal(toolDisplayName('memory_read'), 'Checking memory');
  assert.equal(toolDisplayName('web_fetch'), 'Reading a page');
  assert.equal(toolDisplayName('plan_topic'), 'Plan topic');
  const fetching: ToolActivityItem = {
    id: 'fetch-1',
    type: 'tool_call',
    name: 'web_fetch',
    status: 'pending',
    timestamp: 100,
    input: { url: 'https://example.com/page' },
  };
  assert.equal(
    summarizeActivity({
      orderedActivity: [fetching],
      toolCalls: [],
      reasoning: '',
      isLive: true,
    }),
    'Reading a page: example.com',
  );
});

test('a tool row speaks plainly: refusals quietly, failures on their own line, no clock for quick work', () => {
  const tool = (patch: Partial<ToolActivityItem>): ToolActivityItem => ({
    id: 't',
    type: 'tool_call',
    name: 'record_evidence',
    timestamp: 1,
    status: 'success',
    ...patch,
  });
  const refused = toolAnnotation(
    tool({ status: 'error', category: 'tutor', error: 'You already recorded evidence.' }),
  );
  assert.equal(refused.text, 'Not applied');
  assert.equal(refused.error, undefined);
  assert.equal(refused.hint, 'You already recorded evidence.');

  const failed = toolAnnotation(tool({ status: 'error', error: 'Network down' }));
  assert.deepEqual([failed.text, failed.error, failed.detail], ['Failed', true, 'Network down']);

  assert.equal(toolAnnotation(tool({ duration: 34 })).text, '');
  assert.equal(toolAnnotation(tool({ duration: 2300 })).text, '2.3s');
});

test('a refused memory call says what came of it, never the reason written for the model', () => {
  const refused = (name: string) =>
    toolAnnotation({
      id: 't',
      type: 'tool_call',
      name,
      timestamp: 1,
      status: 'error',
      input: { folder: 'Learning' },
      error: 'Learning holds only what the person studies with the tutor.',
    });
  const save = refused('memory_save');
  assert.deepEqual(
    [save.text, save.error, save.detail, save.hint],
    ['Not saved', undefined, undefined, undefined],
  );
  assert.equal(refused('memory_read').text, 'Not found');
  assert.equal(
    toolObject({
      id: 't',
      type: 'tool_call',
      name: 'memory_save',
      timestamp: 1,
      status: 'success',
      input: { folder: 'Exams' },
    }),
    'Exams',
  );
});

test('a tool call the person stopped reads quietly, not as a failure', () => {
  const stopped = toolAnnotation({
    id: 't',
    type: 'tool_call',
    name: 'web_search',
    timestamp: 1,
    status: 'error',
    error: 'Stopped',
  });
  assert.equal(stopped.text, 'Stopped');
  assert.equal(stopped.error, undefined);
  assert.equal(stopped.detail, undefined);
});

test('a failed search does not hold the head while the model carries on', () => {
  const reasoning = 'The search failed. I will answer from what I know.';
  const orderedActivity = buildOrderedResponseActivity({ reasoning });
  const sources = { query: 'q', status: 'error' as const, error: 'The search took too long.' };
  assert.equal(
    summarizeActivity({ orderedActivity, toolCalls: [], reasoning, sources, isLive: true }),
    'The search failed.',
  );
  assert.equal(
    summarizeActivity({ orderedActivity, toolCalls: [], reasoning, sources, isLive: false }),
    'Search failed',
  );
  // Why is said once, on the search's own entry.
  const entry = buildOrderedResponseActivity({ reasoning: '', sources }).find(
    (item): item is ToolActivityItem => item.type === 'tool_call',
  );
  assert.ok(entry);
  assert.equal(toolAnnotation(entry).detail, 'The search took too long.');
});

test('a wait for the first word is said only once it has gone on a while, counting up', () => {
  assert.equal(silentWaitLine(0), '');
  assert.equal(silentWaitLine(4_999), '');
  assert.equal(silentWaitLine(5_000), 'Waiting for the model… 5s');
  assert.equal(silentWaitLine(12_700), 'Waiting for the model… 12s');
});
