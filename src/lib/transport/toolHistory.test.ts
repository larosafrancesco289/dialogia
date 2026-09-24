import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnthropicBody } from '@/lib/anthropic/request';
import { buildChatBody } from '@/lib/openrouter/request';
import { endpointBodyOptions } from '@/lib/openrouter/endpointBody';
import { withoutToolHistory } from '@/lib/transport/toolHistory';
import type { ModelMessage, ToolDefinition } from '@/lib/transport/contracts';
import type { ProviderEndpoint } from '@/lib/transport/endpoints';

// The shape `buildChatCompletionMessages` replays a tool-using turn as.
const replayed: ModelMessage[] = [
  { role: 'system', content: 'You are a tutor.' },
  { role: 'user', content: 'Quiz me.' },
  {
    role: 'assistant',
    content: 'Here is one.',
    tool_calls: [
      { id: 'call_1', type: 'function', function: { name: 'give_quiz', arguments: '{"n":1}' } },
      { id: 'call_2', type: 'function', function: { name: 'note', arguments: '{}' } },
    ],
  },
  { role: 'tool', name: 'give_quiz', tool_call_id: 'call_1', content: '{"ok":true}' },
  { role: 'tool', name: 'note', tool_call_id: 'call_2', content: '{"ok":true}' },
  { role: 'assistant', content: 'Take your time.' },
  { role: 'user', content: 'Answered the quiz: 1 of 1 right' },
];

// A turn that ended on its tool call: the results sit right before the next user message.
const endedOnTool: ModelMessage[] = [
  { role: 'user', content: 'Quiz me.' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [
      { id: 'call_1', type: 'function', function: { name: 'give_quiz', arguments: '{}' } },
    ],
  },
  { role: 'tool', name: 'give_quiz', tool_call_id: 'call_1', content: '{"ok":true}' },
  { role: 'user', content: 'Answered the quiz.' },
];

const tools: ToolDefinition[] = [
  { type: 'function', function: { name: 'give_quiz', parameters: { type: 'object' } } },
  { type: 'function', function: { name: 'note', parameters: { type: 'object' } } },
];

test('Anthropic conversion turns replayed rounds into tool_use and tool_result blocks', () => {
  const body = buildAnthropicBody({
    model: 'anthropic/claude-haiku-4.5',
    messages: replayed,
    stream: false,
    tools,
  });

  assert.deepEqual(body.messages, [
    { role: 'user', content: 'Quiz me.' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Here is one.' },
        { type: 'tool_use', id: 'call_1', name: 'give_quiz', input: { n: 1 } },
        { type: 'tool_use', id: 'call_2', name: 'note', input: {} },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_1', content: '{"ok":true}' },
        { type: 'tool_result', tool_use_id: 'call_2', content: '{"ok":true}' },
      ],
    },
    { role: 'assistant', content: [{ type: 'text', text: 'Take your time.' }] },
    { role: 'user', content: 'Answered the quiz: 1 of 1 right' },
  ]);
});

test('Anthropic conversion puts tool results and the next user message in one turn', () => {
  const body = buildAnthropicBody({
    model: 'anthropic/claude-haiku-4.5',
    messages: endedOnTool,
    stream: false,
    tools,
  });

  assert.deepEqual(body.messages.slice(1), [
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'call_1', name: 'give_quiz', input: {} }],
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_1', content: '{"ok":true}' },
        { type: 'text', text: 'Answered the quiz.' },
      ],
    },
  ]);
});

test('Anthropic conversion folds tool history away when the request defines no tools', () => {
  const body = buildAnthropicBody({
    model: 'anthropic/claude-haiku-4.5',
    messages: replayed,
    stream: false,
  });

  const json = JSON.stringify(body.messages);
  assert.ok(!json.includes('tool_use') && !json.includes('tool_result'));
  assert.deepEqual(body.messages, [
    { role: 'user', content: 'Quiz me.' },
    { role: 'assistant', content: [{ type: 'text', text: 'Here is one.\n\nTake your time.' }] },
    { role: 'user', content: 'Answered the quiz: 1 of 1 right' },
  ]);
  assert.equal(body.tools, undefined);
});

test('OpenRouter keeps replayed tool messages verbatim when tools are offered', () => {
  const body = buildChatBody({ model: 'openai/gpt-5', messages: replayed, stream: true, tools });
  assert.deepEqual(body.messages, replayed);
});

test('OpenRouter folds replayed tool messages when no tools are offered', () => {
  const body = buildChatBody({ model: 'openai/gpt-5', messages: endedOnTool, stream: true });
  assert.deepEqual(body.messages, [
    { role: 'user', content: 'Quiz me.' },
    { role: 'user', content: 'Answered the quiz.' },
  ]);
});

test('an OpenAI-compatible endpoint without tool support never sees tool messages', () => {
  const endpoint: ProviderEndpoint = {
    id: 'ollama',
    kind: 'openai-compatible',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
  };
  const body = buildChatBody({
    ...endpointBodyOptions({ endpoint }),
    model: 'llama',
    messages: replayed,
    stream: true,
    tools,
  });
  assert.equal(body.tools, undefined);
  assert.ok(!body.messages.some((m) => m.role === 'tool'));
  assert.ok(!body.messages.some((m) => m.role === 'assistant' && m.tool_calls));
  assert.equal(
    body.messages.find((m) => m.role === 'assistant')?.content,
    'Here is one.\n\nTake your time.',
  );

  const withTools = buildChatBody({
    ...endpointBodyOptions({ endpoint: { ...endpoint, capabilities: { tools: true } } }),
    model: 'llama',
    messages: replayed,
    stream: true,
    tools,
  });
  assert.deepEqual(withTools.messages, replayed);
});

test('folding leaves a conversation with no tool traffic untouched', () => {
  const plain: ModelMessage[] = [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello' },
    { role: 'assistant', content: 'Again' },
  ];
  assert.equal(withoutToolHistory(plain), plain);
});
