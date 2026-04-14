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
