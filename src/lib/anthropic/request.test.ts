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

test('buildAnthropicBody converts image_url parts to Anthropic image blocks', () => {
  const body = buildAnthropicBody({
    model: 'claude-opus-4-6',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA=' } }],
      },
    ],
    stream: false,
  });

  assert.deepEqual(body.messages[0]?.content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA=' } },
  ]);
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

test('buildAnthropicBody resolves Anthropic Opus 4.7 alias and uses adaptive thinking', () => {
  const body = buildAnthropicBody({
    model: 'anthropic-direct/claude-opus-4-7',
    messages: [{ role: 'user', content: 'Think hard.' }],
    stream: false,
    reasoningEffort: 'xhigh',
  });

  assert.equal(body.model, 'claude-opus-4-7');
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized' });
  assert.deepEqual(body.output_config, { effort: 'xhigh' });
});

test('buildAnthropicBody resolves Anthropic Opus 4.8 alias and uses adaptive thinking', () => {
  const body = buildAnthropicBody({
    model: 'anthropic-direct/claude-opus-4.8',
    messages: [{ role: 'user', content: 'Think hard.' }],
    stream: false,
    reasoningEffort: 'xhigh',
  });

  assert.equal(body.model, 'claude-opus-4-8');
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized' });
  assert.deepEqual(body.output_config, { effort: 'xhigh' });
});

test('buildAnthropicBody keeps Opus 4.7 snapshots on adaptive thinking', () => {
  const body = buildAnthropicBody({
    model: 'anthropic-direct/claude-opus-4-7-20260101',
    messages: [{ role: 'user', content: 'Think hard.' }],
    stream: false,
    reasoningEffort: 'xhigh',
  });

  assert.equal(body.model, 'claude-opus-4-7-20260101');
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized' });
  assert.deepEqual(body.output_config, { effort: 'xhigh' });
});

test('an id the alias map has not caught up with is still sent to the API', () => {
  const body = buildAnthropicBody({
    model: 'anthropic-direct/claude-brand-new-7',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false,
  });
  assert.equal(body.model, 'claude-brand-new-7');
});

test('audio content is reported rather than dropped in silence', () => {
  const dropped: string[][] = [];
  const body = buildAnthropicBody({
    model: 'claude-haiku-4-5',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'transcribe this' },
          { type: 'input_audio', input_audio: { data: 'AAAA', format: 'wav' } },
        ],
      },
    ],
    stream: false,
    onUnsupportedContent: (kinds) => dropped.push(kinds),
  });
  assert.deepEqual(dropped, [['audio']]);
  assert.equal(body.messages[0].content, 'transcribe this');
});

test('Claude models released after the capability rules still get the right request', () => {
  for (const model of ['claude-opus-5-5', 'claude-fable-5-1', 'claude-opus-6']) {
    const body = buildAnthropicBody({
      model: `anthropic-direct/${model}`,
      messages: [{ role: 'user', content: 'Think.' }],
      stream: false,
      reasoningEffort: 'high',
    });
    assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized' }, model);
  }
  const haiku = buildAnthropicBody({
    model: 'anthropic-direct/claude-haiku-4-5-20251001',
    messages: [{ role: 'user', content: 'Think.' }],
    stream: false,
    reasoningEffort: 'high',
  });
  assert.equal((haiku.thinking as { type?: string } | undefined)?.type, 'enabled');
});

test('a budget-thinking reply always leaves room for its answer', () => {
  for (const reasoningEffort of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
    const body = buildAnthropicBody({
      model: 'anthropic-direct/claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'Think.' }],
      stream: true,
      reasoningEffort,
    });
    const thinking = body.thinking as { type: string; budget_tokens: number };
    assert.equal(thinking.type, 'enabled', reasoningEffort);
    assert.ok(body.max_tokens >= thinking.budget_tokens + 1024, reasoningEffort);
  }
  // A short limit the chat asked for (a title, say) grows to fit the budget.
  const short = buildAnthropicBody({
    model: 'anthropic-direct/claude-sonnet-4-5',
    messages: [{ role: 'user', content: 'Name this chat.' }],
    stream: false,
    maxTokens: 150,
    reasoningEffort: 'high',
  });
  const budget = (short.thinking as { budget_tokens: number }).budget_tokens;
  assert.ok(short.max_tokens > budget);
});

test('a long answer is not cut short by a small default max_tokens', () => {
  const adaptive = buildAnthropicBody({
    model: 'anthropic-direct/claude-opus-4-7',
    messages: [{ role: 'user', content: 'Write it all out.' }],
    stream: true,
    reasoningEffort: 'high',
  });
  assert.equal(adaptive.max_tokens, 32000);
  const plain = buildAnthropicBody({
    model: 'anthropic-direct/claude-haiku-4-5',
    messages: [{ role: 'user', content: 'Hi' }],
    stream: true,
    maxTokens: 500,
  });
  assert.equal(plain.max_tokens, 500, 'a limit the chat sets is kept when nothing needs more');
  // Older models stop lower, and the API refuses a value above that.
  const older = buildAnthropicBody({
    model: 'anthropic-direct/claude-3-5-haiku-20241022',
    messages: [{ role: 'user', content: 'Hi' }],
    stream: true,
  });
  assert.equal(older.max_tokens, 8192);
});

test('reasoning off says so from Claude 5 on, where thinking runs unless refused', () => {
  const off = (model: string) =>
    buildAnthropicBody({
      model: `anthropic-direct/${model}`,
      messages: [{ role: 'user', content: 'Name this chat.' }],
      stream: false,
      disableReasoning: true,
    });
  assert.deepEqual(off('claude-haiku-5-5').thinking, { type: 'disabled' });
  assert.deepEqual(off('claude-sonnet-5').thinking, { type: 'disabled' });
  assert.deepEqual(off('claude-opus-5').thinking, { type: 'disabled' });
  // Sonnet 5.5 refuses "disabled"; its lowest setting is between_tools.
  assert.deepEqual(off('claude-sonnet-5-5').thinking, { type: 'between_tools' });
  // Before Claude 5 a missing field already means no thinking.
  assert.equal(off('claude-opus-4-8').thinking, undefined);
  assert.equal(off('claude-haiku-4-5').thinking, undefined);
  // Thinking cannot be turned off here, and "disabled" would be a 400.
  assert.equal(off('claude-opus-5-5').thinking, undefined);
  assert.equal(off('claude-fable-5-1').thinking, undefined);
  for (const model of ['claude-haiku-5-5', 'claude-sonnet-5-5']) {
    assert.equal(off(model).output_config, undefined, model);
  }
});

test('thinking without a chosen effort runs at the model’s documented default', () => {
  const effortOf = (model: string) =>
    buildAnthropicBody({
      model: `anthropic-direct/${model}`,
      messages: [{ role: 'user', content: 'Think.' }],
      stream: false,
      reasoningTokens: 2048,
    }).output_config?.effort;
  assert.equal(effortOf('claude-haiku-5-5'), 'medium');
  assert.equal(effortOf('claude-opus-5-5'), 'medium');
  assert.equal(effortOf('claude-sonnet-5-5'), 'high');
  assert.equal(effortOf('claude-fable-5-1'), 'high');
  assert.equal(effortOf('claude-opus-5'), 'high');
});

test('sampling is sent only where the model takes it', () => {
  const sampling = (
    model: string,
    opts: { temperature?: number; topP?: number; think?: boolean },
  ) => {
    const body = buildAnthropicBody({
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false,
      temperature: opts.temperature,
      topP: opts.topP,
      ...(opts.think ? { reasoningEffort: 'medium' as const } : {}),
    });
    return { temperature: body.temperature, top_p: body.top_p };
  };
  const none = { temperature: undefined, top_p: undefined };

  // Claude 5 on, and Opus from 4.7, refuse any non-default value, thinking or not.
  for (const model of [
    'claude-haiku-5-5',
    'claude-sonnet-5',
    'claude-opus-4-7',
    'claude-fable-5-1',
  ]) {
    assert.deepEqual(sampling(model, { temperature: 0.8 }), none, model);
    assert.deepEqual(sampling(model, { topP: 0.9 }), none, model);
  }
  // Before them, sampling stands while thinking is off; from Opus 4.1 only one of the two.
  assert.deepEqual(sampling('claude-haiku-4-5', { temperature: 0.8 }), {
    temperature: 0.8,
    top_p: undefined,
  });
  assert.deepEqual(sampling('claude-sonnet-4-5', { temperature: 0.8, topP: 0.9 }), {
    temperature: 0.8,
    top_p: undefined,
  });
  assert.deepEqual(sampling('claude-3-7-sonnet-latest', { temperature: 0.8, topP: 0.9 }), {
    temperature: 0.8,
    top_p: 0.9,
  });
  // Thinking rules out temperature and keeps top_p only from 0.95 to 1.
  assert.deepEqual(sampling('claude-sonnet-4-5', { temperature: 0.8, think: true }), none);
  assert.deepEqual(sampling('claude-sonnet-4-5', { topP: 0.9, think: true }), none);
  assert.deepEqual(sampling('claude-sonnet-4-5', { topP: 0.97, think: true }), {
    temperature: undefined,
    top_p: 0.97,
  });
});

test('a reply goes back block for block, with only the calls the message still answers', () => {
  const citation = { type: 'web_search_result_location', url: 'https://a.test', cited_text: 'A.' };
  const content = [
    { type: 'thinking', thinking: 'Hm.', signature: 's1' },
    { type: 'redacted_thinking', data: 'opaque' },
    { type: 'server_tool_use', id: 'srv', name: 'web_search', input: { query: 'a' } },
    { type: 'web_search_tool_result', tool_use_id: 'srv', content: [] },
    { type: 'thinking', thinking: 'Then.', signature: 's2' },
    { type: 'text', text: 'Found A.', citations: [citation] },
    { type: 'tool_use', id: 'kept', name: 'note', input: { a: 1 } },
    { type: 'tool_use', id: 'dropped', name: 'note', input: { a: 2 } },
  ];
  const body = buildAnthropicBody({
    model: 'claude-haiku-5-5',
    stream: false,
    tools: [{ type: 'function', function: { name: 'note', parameters: { type: 'object' } } }],
    messages: [
      { role: 'user', content: 'Go.' },
      {
        role: 'assistant',
        content: 'Found A.',
        tool_calls: [{ id: 'kept', type: 'function', function: { name: 'note', arguments: '{}' } }],
        reasoning_details: { provider: 'anthropic', thinkingBlocks: [], content },
      },
      { role: 'tool', tool_call_id: 'kept', content: '{"ok":true}' },
    ],
  });
  assert.deepEqual(body.messages[1], {
    role: 'assistant',
    content: content.filter((block) => !('id' in block && block.id === 'dropped')),
  });
});

test('a reply kept without its whole content still sends its thinking first', () => {
  const body = buildAnthropicBody({
    model: 'claude-haiku-5-5',
    stream: false,
    tools: [{ type: 'function', function: { name: 'note', parameters: { type: 'object' } } }],
    messages: [
      { role: 'user', content: 'Go.' },
      {
        role: 'assistant',
        content: 'Noting.',
        tool_calls: [{ id: 'c', type: 'function', function: { name: 'note', arguments: '{}' } }],
        reasoning_details: {
          provider: 'anthropic',
          thinkingBlocks: [{ type: 'thinking', thinking: 'Hm.', signature: 's1' }],
        },
      },
      { role: 'tool', tool_call_id: 'c', content: '{"ok":true}' },
    ],
  });
  assert.deepEqual(
    (body.messages[1].content as Array<{ type: string }>).map((block) => block.type),
    ['thinking', 'text', 'tool_use'],
  );
});
