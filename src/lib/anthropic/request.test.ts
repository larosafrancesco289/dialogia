import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnthropicBody } from '@/lib/anthropic/request';

test('buildAnthropicBody maps the web plugin to Anthropic web search', () => {
  const body = buildAnthropicBody({
    model: 'anthropic/claude-haiku-4.5',
    messages: [{ role: 'user', content: 'Find the latest renewable energy news.' }],
    stream: false,
    plugins: [{ id: 'web' }],
  });

  assert.deepEqual(body.tools, [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
    },
  ]);
});

test('buildAnthropicBody preserves function tools alongside web search', () => {
  const body = buildAnthropicBody({
    model: 'anthropic/claude-haiku-4.5',
    messages: [{ role: 'user', content: 'Search and summarize.' }],
    stream: false,
    plugins: [{ id: 'web' }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'record_learning',
          description: 'Store learning state',
          parameters: { type: 'object', properties: {} },
        },
      },
    ],
  });

  assert.equal(body.tools?.length, 2);
  assert.equal(
    body.tools?.[0] && 'name' in body.tools[0] ? body.tools[0].name : undefined,
    'record_learning',
  );
  assert.equal(
    body.tools?.[1] && 'type' in body.tools[1] ? body.tools[1].type : undefined,
    'web_search_20250305',
  );
});

test('buildAnthropicBody enables top-level automatic caching for supported Anthropic models', () => {
  const body = buildAnthropicBody({
    model: 'anthropic/claude-sonnet-4.6',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ],
    stream: false,
    enableAutomaticCaching: true,
  });

  assert.deepEqual(body.cache_control, { type: 'ephemeral' });
});

test('buildAnthropicBody preserves assistant text block cache_control markers', () => {
  const body = buildAnthropicBody({
    model: 'anthropic/claude-sonnet-4.6',
    messages: [
      { role: 'user', content: 'First turn' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Cached assistant turn', cache_control: { type: 'ephemeral' } },
        ],
      },
      { role: 'user', content: 'Follow-up' },
    ],
    stream: false,
  });

  assert.deepEqual(body.messages[1], {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Cached assistant turn', cache_control: { type: 'ephemeral' } },
    ],
  });
});

test('buildAnthropicBody skips automatic caching when four explicit breakpoints already exist', () => {
  const body = buildAnthropicBody({
    model: 'anthropic/claude-sonnet-4.6',
    messages: [
      {
        role: 'system',
        content: [
          { type: 'text', text: 'System A', cache_control: { type: 'ephemeral' } },
          { type: 'text', text: 'System B', cache_control: { type: 'ephemeral' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'User A', cache_control: { type: 'ephemeral' } }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Assistant A', cache_control: { type: 'ephemeral' } }],
      },
      { role: 'user', content: 'Follow-up' },
    ],
    stream: false,
    enableAutomaticCaching: true,
  });

  assert.equal(body.cache_control, undefined);
});
