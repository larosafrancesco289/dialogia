import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestDebugBody, captureRequestDebug } from '@/lib/agent/debug';
import { ProviderSort } from '@/lib/models/providerSort';
import type { TurnContext } from '@/lib/agent/types';
import { createTestStoreState } from '../../../tests/helpers/createTestStoreState';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { buildTransportAuth } from '@/lib/auth/transport';

const createStubTurn = () => {
  const baseUi = buildDefaultUIState();
  const { state, set, get } = createTestStoreState({
    ui: {
      ...baseUi,
      debug: {
        ...baseUi.debug,
        mode: true,
        byMessageId: {} as Record<string, { body: string; createdAt: number }>,
      },
    },
  });
  const turn: TurnContext = {
    auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'key' }),
    set,
    get,
    models: [],
    modelIndex: {} as any,
    persistMessage: async () => {},
  };
  return { turn, state };
};

test('buildRequestDebugBody mirrors buildDebugBody options for streaming', () => {
  const payload = buildRequestDebugBody({
    modelId: 'provider/model',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
    includeUsage: true,
    temperature: 0.2,
    topP: 0.9,
    maxTokens: 200,
    reasoningEffort: 'medium',
    reasoningTokens: 800,
    tools: [{ type: 'function', function: { name: 'tool', parameters: { type: 'object' } } }],
    toolChoice: 'auto',
    providerSort: ProviderSort.Price,
    zdrOnly: true,
    plugins: [{ id: 'web' }],
    canImageOut: true,
  });

  assert.equal(payload.model, 'provider/model');
  assert.equal(payload.stream, true);
  assert.deepEqual(payload.stream_options, { include_usage: true });
  assert.equal(payload.temperature, 0.2);
  assert.equal(payload.top_p, 0.9);
  assert.equal(payload.max_tokens, 200);
  assert.deepEqual(payload.reasoning, { effort: 'medium' });
  assert.equal(payload.tools?.[0]?.function?.name, 'tool');
  assert.equal(payload.tool_choice, 'auto');
  assert.deepEqual(payload.provider, { sort: 'price', zdr: true });
  assert.deepEqual(payload.plugins, [{ id: 'web' }]);
  assert.deepEqual(payload.modalities, ['image', 'text']);
});

test('captureRequestDebug records payloads when debug mode is enabled', () => {
  const { turn, state } = createStubTurn();
  captureRequestDebug({
    turn,
    messageId: 'm1',
    modelId: 'provider/model',
    messages: [],
    stream: false,
  });
  const entry = state.ui.debug.byMessageId?.['m1'];
  assert.ok(entry);
  assert.ok(typeof entry.body === 'string');
  const parsed = JSON.parse(entry.body);
  assert.equal(parsed.model, 'provider/model');
});
