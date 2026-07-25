import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelTransportKind } from '@/lib/providers';
import {
  isUnknownEndpointError,
  resolveModelEndpoint,
  setCustomEndpoints,
} from '@/lib/transport/endpointRegistry';
import { buildEndpointModelId } from '@/lib/transport/endpoints';
import { createModelIndex } from '@/lib/models';

test('legacy Anthropic model ids still resolve to the Anthropic endpoint', () => {
  assert.equal(resolveModelTransportKind('anthropic/claude-haiku-4.5'), 'anthropic');
  assert.equal(resolveModelTransportKind('anthropic-direct/claude-haiku-4.5'), 'anthropic');
  assert.equal(resolveModelTransportKind('openrouter/model'), 'openrouter');
});

test('a descriptor endpointId wins over the id-prefix rules', () => {
  const endpoint = resolveModelEndpoint('anthropic/claude-haiku-4.5', {
    id: 'anthropic/claude-haiku-4.5',
    endpointId: 'openrouter',
  });
  assert.equal(endpoint.id, 'openrouter');
});

test('user endpoints claim their own model-id namespace', () => {
  setCustomEndpoints([
    { id: 'lm-studio', kind: 'openai-compatible', label: 'LM Studio', baseUrl: 'http://x/v1' },
  ]);
  try {
    assert.equal(resolveModelEndpoint('endpoint:lm-studio/qwen3-8b').id, 'lm-studio');
    // The bare slug is not the namespace: it stays an ordinary provider id.
    assert.equal(resolveModelEndpoint('lm-studio/qwen3-8b').id, 'openrouter');
    // A chat persisted before the endpoint was added still falls back sanely.
    assert.equal(resolveModelEndpoint('some/other-model').id, 'openrouter');
  } finally {
    setCustomEndpoints([]);
  }
});

test('a custom endpoint cannot shadow the OpenRouter model of the same name', () => {
  setCustomEndpoints([
    { id: 'openai', kind: 'openai-compatible', label: 'My OpenAI', baseUrl: 'http://x/v1' },
  ]);
  try {
    const scoped = buildEndpointModelId('openai', 'gpt-4o');
    assert.notEqual(scoped, 'openai/gpt-4o');
    assert.equal(resolveModelEndpoint(scoped).id, 'openai');
    assert.equal(resolveModelEndpoint('openai/gpt-4o').id, 'openrouter');

    // Custom endpoints are merged after the built-ins, so a shared id would have
    // silently replaced the OpenRouter entry.
    const index = createModelIndex([
      { id: 'openai/gpt-4o', endpointId: 'openrouter' },
      { id: scoped, endpointId: 'openai', transportModelId: 'gpt-4o' },
    ]);
    assert.equal(index.byId.size, 2);
    assert.equal(index.get('openai/gpt-4o')?.endpointId, 'openrouter');
    assert.equal(index.get(scoped)?.endpointId, 'openai');
  } finally {
    setCustomEndpoints([]);
  }
});

test('a model scoped to a deleted endpoint fails instead of falling back to OpenRouter', () => {
  setCustomEndpoints([]);
  assert.throws(
    () => resolveModelEndpoint('endpoint:lm-studio/qwen3-8b'),
    (error: unknown) => isUnknownEndpointError(error) && error.endpointId === 'lm-studio',
  );
  // Nothing in the reserved namespace may fall through, malformed included.
  assert.throws(() => resolveModelEndpoint('endpoint:lm-studio'), isUnknownEndpointError);
});
