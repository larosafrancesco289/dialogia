import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anthropicChatCompletion,
  chatCompletion,
  resolveAnthropicDirectModelId,
} from '@/lib/anthropic/chat';
import { buildTransportAuth } from '@/lib/auth/transport';

test('resolveAnthropicDirectModelId maps current aliases to direct IDs', () => {
  assert.equal(resolveAnthropicDirectModelId('claude-opus-4-6'), 'claude-opus-4-6');
  assert.equal(resolveAnthropicDirectModelId('claude-sonnet-4.5'), 'claude-sonnet-4-5-20250929');
  assert.equal(resolveAnthropicDirectModelId('claude-haiku-4.5'), 'claude-haiku-4-5-20251001');
});

test('resolveAnthropicDirectModelId maps legacy aliases to direct IDs', () => {
  assert.equal(resolveAnthropicDirectModelId('claude-opus-4-5'), 'claude-opus-4-5-20251101');
  assert.equal(resolveAnthropicDirectModelId('claude-opus-4-1'), 'claude-opus-4-1-20250805');
  assert.equal(resolveAnthropicDirectModelId('claude-sonnet-4-0'), 'claude-sonnet-4-20250514');
  assert.equal(resolveAnthropicDirectModelId('claude-opus-4-0'), 'claude-opus-4-20250514');
  assert.equal(
    resolveAnthropicDirectModelId('claude-3-7-sonnet-latest'),
    'claude-3-7-sonnet-latest',
  );
});

test('resolveAnthropicDirectModelId accepts snapshot IDs as-is', () => {
  assert.equal(
    resolveAnthropicDirectModelId('claude-sonnet-4-20250514'),
    'claude-sonnet-4-20250514',
  );
  assert.equal(resolveAnthropicDirectModelId('claude-3-haiku-20240307'), 'claude-3-haiku-20240307');
});

test('resolveAnthropicDirectModelId strips anthropic prefix', () => {
  assert.equal(
    resolveAnthropicDirectModelId('anthropic/claude-sonnet-4-5'),
    'claude-sonnet-4-5-20250929',
  );
  assert.equal(
    resolveAnthropicDirectModelId('anthropic-direct/claude-sonnet-4-5'),
    'claude-sonnet-4-5-20250929',
  );
});

test('resolveAnthropicDirectModelId returns undefined for unknown aliases', () => {
  assert.equal(resolveAnthropicDirectModelId('claude-sonnet-5'), undefined);
  assert.equal(resolveAnthropicDirectModelId('anthropic/foo'), undefined);
});

test('anthropicChatCompletion converts image content blocks to Anthropic image blocks', async () => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        id: 'msg_123',
        model: 'claude-opus-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    await anthropicChatCompletion({
      apiKey: 'test-key',
      model: 'claude-opus-4-6',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA=' } }],
        },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(body && Array.isArray(body.messages));
  const outbound = body.messages as Array<{ content: unknown }>;
  assert.deepEqual(outbound[0]?.content, [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'AAA=',
      },
    },
  ]);
});

test('anthropicChatCompletion preserves text block arrays for cache_control', async () => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        id: 'msg_123',
        model: 'claude-opus-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    await anthropicChatCompletion({
      apiKey: 'test-key',
      model: 'claude-opus-4-6',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }],
        },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(body && Array.isArray(body.messages));
  const outbound = body.messages as Array<{ content: unknown }>;
  assert.deepEqual(outbound[0]?.content, [
    { type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } },
  ]);
});

test('anthropicChatCompletion does not invent unsupported top-level caching params', async () => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        id: 'msg_123',
        model: 'claude-opus-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    await anthropicChatCompletion({
      apiKey: 'test-key',
      model: 'claude-opus-4-6',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'hello' },
      ],
      enableAutomaticCaching: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal('cache_control' in (body ?? {}), false);
});

test('chatCompletion continues Anthropic pause_turn responses', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  let callCount = 0;
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    callCount += 1;

    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          id: 'msg_pause',
          model: 'claude-sonnet-4-6',
          stop_reason: 'pause_turn',
          content: [
            { type: 'text', text: "I'll search for that." },
            {
              type: 'server_tool_use',
              id: 'srvtool_1',
              name: 'web_search',
              input: { query: 'renewable energy latest developments' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtool_1',
              content: [
                {
                  type: 'web_search_result',
                  title: 'Example',
                  url: 'https://example.com',
                  encrypted_content: 'abc',
                },
              ],
            },
          ],
          usage: { input_tokens: 11, output_tokens: 17 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        id: 'msg_final',
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Here is the latest summary.' }],
        usage: { input_tokens: 7, output_tokens: 13 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const response = await chatCompletion({
      auth: buildTransportAuth({
        transport: 'anthropic',
        apiKey: 'test-key',
        useProxy: false,
      }),
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'What are the latest renewable energy developments?' }],
      plugins: [{ id: 'web' }],
    });

    assert.equal(response.choices[0]?.message.content, 'Here is the latest summary.');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(callCount, 2);
  const secondMessages = requestBodies[1]?.messages as Array<Record<string, unknown>>;
  assert.equal(secondMessages.at(-1)?.role, 'assistant');
  assert.equal(Array.isArray(secondMessages.at(-1)?.content), true);
  assert.equal((secondMessages.at(-1)?.content as Array<unknown>).length, 3);
});
