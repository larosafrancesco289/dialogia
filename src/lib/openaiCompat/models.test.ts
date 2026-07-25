import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchModels } from '@/lib/openaiCompat/models';
import type { ProviderEndpoint } from '@/lib/transport/endpoints';

const endpoint: ProviderEndpoint = {
  id: 'ollama',
  kind: 'openai-compatible',
  label: 'Ollama',
  baseUrl: 'http://localhost:11434/v1',
  modelIds: ['qwen3:8b'],
};

test('configured model ids survive a server with no /models route', async () => {
  const models = await fetchModels(
    { endpoint },
    { fetchFn: async () => new Response('not found', { status: 404 }) },
  );
  assert.deepEqual(
    models.map((model) => model.id),
    ['ollama/qwen3:8b'],
  );
  assert.equal(models[0].transportModelId, 'qwen3:8b');
  assert.equal(models[0].endpointId, 'ollama');
});

test('discovered models are merged after the configured ones, without duplicates', async () => {
  const models = await fetchModels(
    { endpoint },
    {
      fetchFn: async () =>
        new Response(JSON.stringify({ data: [{ id: 'qwen3:8b' }, { id: 'llama3.2' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    },
  );
  assert.deepEqual(
    models.map((model) => model.id),
    ['ollama/qwen3:8b', 'ollama/llama3.2'],
  );
});

test('capabilities come from the endpoint, never from the model name', async () => {
  const models = await fetchModels(
    { endpoint: { ...endpoint, capabilities: { tools: true, vision: true } } },
    { fetchFn: async () => new Response('nope', { status: 500 }) },
  );
  const raw = models[0].raw as { supported_parameters: string[]; input_modalities: string[] };
  assert.deepEqual(raw.supported_parameters, ['tools', 'vision']);
  assert.deepEqual(raw.input_modalities, ['text', 'image']);
});
