import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatBody } from '@/lib/openrouter/request';
import { endpointBodyOptions, endpointWireModelId } from '@/lib/openrouter/endpointBody';
import { ProviderSort } from '@/lib/models/providerSort';
import { OPENROUTER_ENDPOINT, type ProviderEndpoint } from '@/lib/transport/endpoints';

const localEndpoint: ProviderEndpoint = {
  id: 'lm-studio',
  kind: 'openai-compatible',
  label: 'LM Studio',
  baseUrl: 'http://localhost:1234/v1',
};

const fullRequest = {
  messages: [{ role: 'user' as const, content: 'hi' }],
  stream: true,
  modalities: ['text' as const],
  temperature: 0.4,
  maxTokens: 100,
  reasoningEffort: 'high' as const,
  tools: [
    { type: 'function' as const, function: { name: 'web_search', parameters: { type: 'object' } } },
  ],
  toolChoice: 'auto' as const,
  parallelToolCalls: true,
  providerSort: ProviderSort.Price,
  zdrOnly: true,
  plugins: [{ id: 'web' as const }],
  includeUsage: true,
};

test('a user endpoint emits only the minimal OpenAI fields by default', () => {
  const auth = { endpoint: localEndpoint };
  const body = buildChatBody({
    ...endpointBodyOptions(auth),
    ...fullRequest,
    model: endpointWireModelId(auth, 'lm-studio/qwen3-8b'),
  });

  assert.deepEqual(Object.keys(body).sort(), [
    'max_tokens',
    'messages',
    'model',
    'stream',
    'temperature',
  ]);
  // The endpoint prefix is an app-side construct; the server wants the bare id.
  assert.equal(body.model, 'qwen3-8b');
});

test('capabilities the user turns on are emitted, and only those', () => {
  const auth = {
    endpoint: { ...localEndpoint, capabilities: { tools: true, streamUsage: true } },
  };
  const body = buildChatBody({
    ...endpointBodyOptions(auth),
    ...fullRequest,
    model: endpointWireModelId(auth, 'lm-studio/qwen3-8b'),
  });

  assert.ok(body.tools);
  assert.equal(body.tool_choice, 'auto');
  assert.deepEqual(body.stream_options, { include_usage: true });
  // parallelToolCalls stayed off, so it is not emitted even though tools are on.
  assert.equal(body.parallel_tool_calls, undefined);
  assert.equal(body.reasoning, undefined);
  assert.equal(body.provider, undefined);
  assert.equal(body.plugins, undefined);
  assert.equal(body.modalities, undefined);
});

test('the built-in endpoints stay ungated', () => {
  const auth = { endpoint: OPENROUTER_ENDPOINT, apiKey: 'k' };
  const body = buildChatBody({
    ...endpointBodyOptions(auth),
    ...fullRequest,
    model: endpointWireModelId(auth, 'openai/gpt-4o'),
  });

  assert.equal(body.model, 'openai/gpt-4o');
  assert.deepEqual(body.reasoning, { effort: 'high' });
  assert.deepEqual(body.provider, { sort: 'price', zdr: true });
  assert.deepEqual(body.plugins, [{ id: 'web' }]);
  assert.equal(body.parallel_tool_calls, true);
});
