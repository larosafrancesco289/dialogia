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

const CACHED_MESSAGES = [
  {
    role: 'system' as const,
    content: [
      { type: 'text' as const, text: 'stable', cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: 'dynamic' },
    ],
  },
  {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: 'hi', cache_control: { type: 'ephemeral' as const } },
      { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,AA' } },
    ],
  },
];

test('buildChatBody keeps cache_control markers when the endpoint allows caching', () => {
  const body = buildChatBody({
    ...base,
    messages: CACHED_MESSAGES,
    capabilities: { promptCaching: true, vision: true },
  });
  const system = body.messages[0].content as Array<Record<string, unknown>>;
  assert.deepEqual(system[0].cache_control, { type: 'ephemeral' });
});

test('buildChatBody strips cache_control when the endpoint does not do prompt caching', () => {
  // `cache_control` is injected in the agent layer, which knows nothing about
  // endpoints; a strict OpenAI-compatible server 400s the whole request over
  // the unknown key, so the capability has to be enforced here.
  const body = buildChatBody({
    ...base,
    messages: CACHED_MESSAGES,
    capabilities: { vision: true },
  });
  // Text-only blocks collapse back to the plain string shape a minimal server wants.
  assert.equal(body.messages[0].content, 'stable\n\ndynamic');
  const user = body.messages[1].content as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(user));
  assert.equal('cache_control' in user[0], false);
  assert.equal(user[1].type, 'image_url');
  assert.equal(JSON.stringify(body).includes('cache_control'), false);
});

test('buildChatBody leaves built-in transports untouched by the caching gate', () => {
  const body = buildChatBody({ ...base, messages: CACHED_MESSAGES });
  const system = body.messages[0].content as Array<Record<string, unknown>>;
  assert.deepEqual(system[0].cache_control, { type: 'ephemeral' });
});
