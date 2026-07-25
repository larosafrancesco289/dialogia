import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelTransportKind } from '@/lib/providers';
import { resolveModelEndpoint, setCustomEndpoints } from '@/lib/transport/endpointRegistry';

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

test('user endpoints claim their own model-id prefix', () => {
  setCustomEndpoints([
    { id: 'lm-studio', kind: 'openai-compatible', label: 'LM Studio', baseUrl: 'http://x/v1' },
  ]);
  try {
    assert.equal(resolveModelEndpoint('lm-studio/qwen3-8b').id, 'lm-studio');
    // A chat persisted before the endpoint was added still falls back sanely.
    assert.equal(resolveModelEndpoint('some/other-model').id, 'openrouter');
  } finally {
    setCustomEndpoints([]);
  }
});
