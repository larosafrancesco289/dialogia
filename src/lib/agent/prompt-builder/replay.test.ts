import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatCompletionMessages } from '@/lib/agent/prompt-builder';
import { splitReplaySegments } from '@/lib/agent/prompt-builder/replay';
import type { ModelMessage } from '@/lib/agent/types';
import type { Chat, Message, MessageToolRound, ModelDescriptor } from '@/lib/types';

const chat: Chat = {
  id: 'chat-replay',
  title: 'Replay',
  createdAt: 0,
  updatedAt: 0,
  settings: {
    modelId: 'provider/model',
    generation: { maxTokens: 256 },
    ui: {
      showThinkingByDefault: false,
      showStats: false,
      showToolCallLog: false,
      showDebugRawJson: false,
    },
    features: { search: { enabled: false, provider: 'openrouter' } },
  },
};

const model = (contextLength: number): ModelDescriptor => ({
  id: 'provider/model',
  name: 'Model',
  context_length: contextLength,
  pricing: undefined,
});

const message = (
  id: string,
  role: 'user' | 'assistant',
  content: string,
  extra: Partial<Message> = {},
): Message => ({ id, chatId: chat.id, role, content, createdAt: Date.UTC(2026, 8, 1), ...extra });

const rounds: MessageToolRound[] = [
  {
    text: 'Let me note that.',
    calls: [{ id: 'call_1', name: 'note', arguments: '{"a":1}', result: '{"ok":true}' }],
  },
  {
    text: 'And ask you this.',
    calls: [
      { id: 'call_2', name: 'note', arguments: '{"a":2}', result: '{"ok":true}' },
      { id: 'call_3', name: 'card', arguments: '{}', result: '{"ok":true,"shown":"card"}' },
    ],
  },
];

const build = (priorMessages: Message[], contextLength = 16000, timestamps = false) =>
  buildChatCompletionMessages({
    chat,
    priorMessages,
    models: [model(contextLength)],
    newUserContent: 'Next.',
    timestamps,
  });

const shape = (messages: ModelMessage[]) =>
  messages.map((m) => {
    if (m.role === 'tool') return `tool:${m.tool_call_id}`;
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return `assistant(${String(m.content)})[${m.tool_calls.map((c) => c.id).join(',')}]`;
    }
    return `${m.role}(${typeof m.content === 'string' ? m.content : '…'})`;
  });

test('tool rounds replay as real tool calls and results, in order, around the reply text', () => {
  const messages = build([
    message('u1', 'user', 'Teach me.'),
    message('a1', 'assistant', 'Let me note that.\n\nAnd ask you this.\n\nOver to you.', {
      toolRounds: rounds,
    }),
  ]);

  assert.deepEqual(shape(messages), [
    'user(Teach me.)',
    'assistant(Let me note that.)[call_1]',
    'tool:call_1',
    'assistant(And ask you this.)[call_2,call_3]',
    'tool:call_2',
    'tool:call_3',
    'assistant(Over to you.)',
    'user(Next.)',
  ]);
  const call = messages[1] as Extract<ModelMessage, { role: 'assistant' }>;
  assert.equal(call.tool_calls?.[0].function.name, 'note');
  assert.equal(call.tool_calls?.[0].function.arguments, '{"a":1}');
  const result = messages[2] as Extract<ModelMessage, { role: 'tool' }>;
  assert.equal(result.content, '{"ok":true}');
});

test('a turn that ended on a tool replays no empty closing message', () => {
  const messages = build([
    message('u1', 'user', 'Quiz me.'),
    message('a1', 'assistant', 'Let me note that.\n\nAnd ask you this.', { toolRounds: rounds }),
  ]);
  assert.deepEqual(shape(messages).slice(-2), ['tool:call_3', 'user(Next.)']);
});

test('an edited reply wins over the stored round texts', () => {
  const segments = splitReplaySegments('Something else entirely.', rounds);
  assert.deepEqual(
    segments.map((s) => s.text),
    ['', '', 'Something else entirely.'],
  );
  const messages = build([
    message('u1', 'user', 'Teach me.'),
    message('a1', 'assistant', 'Something else entirely.', { toolRounds: rounds }),
  ]);
  assert.deepEqual(shape(messages).slice(1, -1), [
    'assistant()[call_1]',
    'tool:call_1',
    'assistant()[call_2,call_3]',
    'tool:call_2',
    'tool:call_3',
    'assistant(Something else entirely.)',
  ]);
});

test('replayed tool-call ids are provider-safe and unique across the request', () => {
  const odd: MessageToolRound[] = [
    { text: '', calls: [{ id: 'call:1.x', name: 'note', arguments: '{}', result: '{}' }] },
  ];
  const messages = build([
    message('u1', 'user', 'One.'),
    message('a1', 'assistant', '', { toolRounds: odd }),
    message('u2', 'user', 'Two.'),
    message('a2', 'assistant', '', { toolRounds: odd }),
  ]);
  const ids = messages.flatMap((m) =>
    m.role === 'tool'
      ? [m.tool_call_id]
      : m.role === 'assistant'
        ? (m.tool_calls ?? []).map((c) => c.id)
        : [],
  );
  assert.deepEqual(ids, ['call_1_x', 'call_1_x', 'call_1_x_2', 'call_1_x_2']);
});

test('the timestamp prefix goes on the first replayed text', () => {
  const messages = build(
    [
      message('u1', 'user', 'Teach me.'),
      message('a1', 'assistant', 'Let me note that.\n\nAnd ask you this.', { toolRounds: rounds }),
    ],
    16000,
    true,
  );
  const first = messages[1] as Extract<ModelMessage, { role: 'assistant' }>;
  assert.match(String(first.content), /^\[.+\] Let me note that\.$/);
  const second = messages[3] as Extract<ModelMessage, { role: 'assistant' }>;
  assert.equal(second.content, 'And ask you this.');
});

test('the budget drops a message with its rounds together, never orphaning a result', () => {
  const bulky: MessageToolRound[] = [
    {
      text: 'Checking.',
      calls: [
        { id: 'call_big', name: 'note', arguments: '{}', result: JSON.stringify('x'.repeat(4000)) },
      ],
    },
  ];
  const prior = [
    message('u1', 'user', 'Old question.'),
    message('a1', 'assistant', 'Checking.\n\nOld answer.', { toolRounds: bulky }),
    message('u2', 'user', 'Recent question.'),
    message('a2', 'assistant', 'Recent answer.'),
  ];

  const tight = build(prior, 1200);
  assert.ok(!tight.some((m) => m.role === 'tool'), 'no tool result without its call');
  assert.ok(
    !tight.some((m) => m.role === 'assistant' && m.tool_calls?.length),
    'no call without its result',
  );
  assert.deepEqual(shape(tight).slice(-3), [
    'user(Recent question.)',
    'assistant(Recent answer.)',
    'user(Next.)',
  ]);

  const roomy = build(prior, 16000);
  assert.deepEqual(shape(roomy).slice(0, 4), [
    'user(Old question.)',
    'assistant(Checking.)[call_big]',
    'tool:call_big',
    'assistant(Old answer.)',
  ]);
});
