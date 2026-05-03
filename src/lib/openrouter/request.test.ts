import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatBody } from '@/lib/openrouter/request';
import { ProviderSort } from '@/lib/models/providerSort';

const base = {
  model: 'provider/model',
  messages: [{ role: 'user' as const, content: 'hi' }],
  stream: false,
};

test('buildChatBody prefers reasoning effort over token budget when both are set', () => {
  const body = buildChatBody({
    ...base,
    reasoningEffort: 'high',
    reasoningTokens: 2048,
  });
  assert.deepEqual(body.reasoning, { effort: 'high' });
});

test('buildChatBody sends max_tokens when only reasoning tokens are requested', () => {
  const body = buildChatBody({
    ...base,
    reasoningTokens: 2048,
  });
  assert.deepEqual(body.reasoning, { max_tokens: 2048 });
});

test('buildChatBody force-disables reasoning when disableReasoning is true', () => {
  const body = buildChatBody({
    ...base,
    disableReasoning: true,
    reasoningEffort: 'high',
    reasoningTokens: 2048,
  });
  assert.deepEqual(body.reasoning, { effort: 'none' });
});

test('buildChatBody treats effort none as a hard disable even with stale tokens', () => {
  const body = buildChatBody({
    ...base,
    reasoningEffort: 'none',
    reasoningTokens: 2048,
  });
  assert.deepEqual(body.reasoning, { effort: 'none' });
});

test('buildChatBody forwards xhigh reasoning effort verbatim', () => {
  const body = buildChatBody({
    ...base,
    reasoningEffort: 'xhigh',
  });
  assert.deepEqual(body.reasoning, { effort: 'xhigh' });
});

test('buildChatBody enforces ZDR alongside provider sorting', () => {
  const body = buildChatBody({
    ...base,
    providerSort: ProviderSort.Price,
    zdrOnly: true,
  });

  assert.deepEqual(body.provider, { sort: 'price', zdr: true });
});

test('buildChatBody preserves explicit cache_control message blocks for OpenRouter Anthropic routing', () => {
  const body = buildChatBody({
    model: 'anthropic/claude-sonnet-4.6',
    stream: false,
    messages: [
      {
        role: 'system',
        content: [{ type: 'text', text: 'Stable preamble', cache_control: { type: 'ephemeral' } }],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Cached assistant turn', cache_control: { type: 'ephemeral' } },
        ],
      },
      { role: 'user', content: 'Latest user turn' },
    ],
  });

  assert.deepEqual(body.messages[0], {
    role: 'system',
    content: [{ type: 'text', text: 'Stable preamble', cache_control: { type: 'ephemeral' } }],
  });
  assert.deepEqual(body.messages[1], {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Cached assistant turn', cache_control: { type: 'ephemeral' } },
    ],
  });
});
