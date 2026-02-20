import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anthropicChatCompletion, resolveAnthropicDirectModelId } from '@/lib/anthropic/chat';

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
});

test('resolveAnthropicDirectModelId returns undefined for unknown aliases', () => {
  assert.equal(resolveAnthropicDirectModelId('claude-sonnet-5'), undefined);
  assert.equal(resolveAnthropicDirectModelId('anthropic/foo'), undefined);
});

test('anthropicChatCompletion stringifies non-text content block arrays', async () => {
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
  assert.equal(typeof outbound[0]?.content, 'string');
  assert.match(String(outbound[0]?.content), /image_url/);
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

test('anthropicChatCompletion enables top-level automatic caching for supported models', async () => {
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

  assert.deepEqual(body?.cache_control, { type: 'ephemeral' });
});

test('anthropicChatCompletion skips automatic caching when 4 explicit breakpoints are present', async () => {
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
        {
          role: 'system',
          content: [{ type: 'text', text: 's1', cache_control: { type: 'ephemeral' } }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'u1', cache_control: { type: 'ephemeral' } }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'a1', cache_control: { type: 'ephemeral' } }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'u2', cache_control: { type: 'ephemeral' } }],
        },
      ],
      enableAutomaticCaching: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(body?.cache_control, undefined);
});

test('anthropicChatCompletion keeps automatic caching disabled by default', async () => {
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
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(body?.cache_control, undefined);
});
