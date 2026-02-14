import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatBody } from '@/lib/openrouter/request';

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
