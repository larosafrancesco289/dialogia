import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { buildStoreInitializer } from '@/lib/store/createStore';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';
import { parseCustomEndpoints } from '@/lib/store/endpointSlice';
import type { StoreState } from '@/lib/store/types';
import { listEndpoints, resetEndpointRegistryForTest } from '@/lib/transport/endpointRegistry';
import { requireEndpointAuth } from '@/lib/auth/require';
import { deleteKey, getKey, setKey } from '@/lib/keys/store';
import { mockFetch } from './helpers/mockFetch';

const freshStore = () => createStore<StoreState>(buildStoreInitializer() as never);

test('an added endpoint reaches the registry the request path reads', () => {
  resetEndpointRegistryForTest();
  const store = freshStore();
  store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1/',
  });

  const added = listEndpoints().find((endpoint) => endpoint.id === 'lm-studio');
  assert.ok(added);
  // The trailing slash would double up when a path is appended.
  assert.equal(added.baseUrl, 'http://localhost:1234/v1');
  // The key ref is derived, so the key value never travels with the config.
  assert.equal(added.apiKeyRef, 'endpoint:lm-studio');

  store.getState().removeEndpoint('lm-studio');
  assert.equal(
    listEndpoints().find((endpoint) => endpoint.id === 'lm-studio'),
    undefined,
  );
});

test('the built-ins cannot be removed or shadowed', () => {
  resetEndpointRegistryForTest();
  const store = freshStore();
  store.getState().removeEndpoint('openrouter');
  assert.ok(listEndpoints().some((endpoint) => endpoint.id === 'openrouter'));
  assert.deepEqual(
    parseCustomEndpoints([{ id: 'anthropic', kind: 'anthropic', label: 'Fake' }]),
    [],
  );
});

test('persisted endpoints round-trip and never carry a key value', async () => {
  resetEndpointRegistryForTest();
  const store = freshStore();
  const endpoint = store
    .getState()
    .addEndpoint({ kind: 'openai-compatible', label: 'Ollama', baseUrl: 'http://x/v1' });
  await setKey(endpoint.apiKeyRef!, 'secret-value-1234');

  const persisted = buildPersistedState(store.getState());
  const blob = JSON.stringify(persisted);
  // The config carries a reference; the value stays in the key store.
  assert.ok(blob.includes('endpoint:ollama'));
  assert.ok(!blob.includes('secret-value-1234'));
  await deleteKey(endpoint.apiKeyRef!);

  resetEndpointRegistryForTest();
  const merged = mergePersistedState(freshStore().getState(), persisted);
  assert.equal(merged.customEndpoints.length, 1);
  // Merging is what republishes into the registry on a page load.
  assert.ok(listEndpoints().some((endpoint) => endpoint.id === 'ollama'));
});

test('garbage in the persisted blob is dropped rather than trusted', () => {
  assert.deepEqual(parseCustomEndpoints('nope'), []);
  assert.deepEqual(parseCustomEndpoints([{ id: 'x', kind: 'wat', label: 'X' }]), []);
  assert.deepEqual(parseCustomEndpoints([{ id: 'x', kind: 'openai-compatible' }]), []);
});

test('an imported endpoint cannot claim a key reference it does not own', () => {
  // Otherwise a hostile backup points its own base URL at the real OpenRouter key.
  const parsed = parseCustomEndpoints([
    {
      id: 'evil',
      kind: 'openai-compatible',
      label: 'Evil',
      baseUrl: 'https://attacker.example/v1',
      apiKeyRef: 'openrouter',
    },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].apiKeyRef, 'endpoint:evil');
});

test('a keyless OpenAI-compatible endpoint is callable and contributes models', async () => {
  resetEndpointRegistryForTest();
  const store = freshStore();
  const endpoint = store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    modelIds: ['qwen3:8b'],
  });
  // No key stored for it, and the built-ins have none either.
  assert.equal(getKey(endpoint.apiKeyRef!), undefined);
  assert.doesNotThrow(() => requireEndpointAuth(endpoint));

  const restore = mockFetch((async () => new Response('not found', { status: 404 })) as never);
  try {
    await store.getState().loadModels();
  } finally {
    restore();
  }

  assert.deepEqual(
    store.getState().models.map((model) => model.id),
    ['endpoint:ollama/qwen3:8b'],
  );
  // A usable endpoint means there is nothing for the setup sheet to ask for.
  assert.notEqual(store.getState().ui.setupOpen, true);
});
