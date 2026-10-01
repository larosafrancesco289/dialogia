import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';
import { parseCustomEndpoints } from '@/lib/store/endpointSlice';
import { listEndpoints, resetEndpointRegistryForTest } from '@/lib/transport/endpointRegistry';
import { isValidBaseUrl, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { isEndpointConnected, isEndpointUsable, requireEndpointAuth } from '@/lib/auth/require';
import { deleteKey, getKey, setKey } from '@/lib/keys/store';
import { resolveDefaultModelId } from '@/lib/models';
import {
  selectIntroTourOpen,
  selectResolvedModelId,
  selectResolvedTurnSettings,
  selectSetupSheetOpen,
} from '@/lib/store/selectors';
import { mockFetch } from './helpers/mockFetch';
import { createTestStore } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';
import { resolveSingleModelAuth } from '@/lib/services/auth';

test('an added endpoint reaches the registry the request path reads', () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
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
  const store = createTestStore();
  store.getState().removeEndpoint('openrouter');
  assert.ok(listEndpoints().some((endpoint) => endpoint.id === 'openrouter'));
  assert.deepEqual(
    parseCustomEndpoints([{ id: 'anthropic', kind: 'anthropic', label: 'Fake' }]),
    [],
  );
});

test('persisted endpoints round-trip and never carry a key value', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
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
  const merged = mergePersistedState(createTestStore().getState(), persisted);
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
  const store = createTestStore();
  const endpoint = store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    modelIds: ['qwen3:8b'],
  });
  // No key stored for it, and the built-ins have none either.
  assert.equal(getKey(endpoint.apiKeyRef!), undefined);
  assert.doesNotThrow(() => requireEndpointAuth(endpoint));
  assert.equal(isEndpointConnected(endpoint), true);

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

test('on a local server alone, the composer and header name the open chat model after a load', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    modelIds: ['qwen3:8b', 'llama3.1:8b'],
  });
  // Not the first model, which is what new chats fall back to without GPT Luna.
  const chat = makeChat({ settings: { modelId: 'endpoint:ollama/llama3.1:8b' } });
  store.setState({ chats: [chat], selectedChatId: chat.id });

  const restore = mockFetch((async () => new Response('not found', { status: 404 })) as never);
  try {
    await store.getState().loadModels();
  } finally {
    restore();
  }

  const state = store.getState();
  assert.match(state.ui.notice ?? '', /new chats start with/);
  // The header reads the chat's settings; the composer and the turn read these.
  const fallback = resolveDefaultModelId(state.models);
  assert.equal(selectResolvedModelId(fallback)(state), chat.settings.modelId);
  assert.equal(selectResolvedTurnSettings(state)?.modelId, chat.settings.modelId);
});

test('removing an endpoint removes its key so a reused slug cannot inherit it', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  const first = store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
  });
  await setKey(first.apiKeyRef!, 'secret-for-localhost');

  store.getState().removeEndpoint(first.id);
  // The ref is derived from the id, so an endpoint slugged the same way later
  // would otherwise send this key to whatever host it points at.
  assert.equal(getKey(first.apiKeyRef!), undefined);

  const second = store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Ollama',
    baseUrl: 'https://someone-elses-host.example/v1',
  });
  assert.equal(second.id, first.id);
  assert.equal(getKey(second.apiKeyRef!), undefined);
});

test('a server that is down is named once a session, and again on an explicit refresh', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
  });
  const restore = mockFetch((async () => {
    throw new TypeError('Failed to fetch');
  }) as never);
  try {
    await store.getState().loadModels();
    assert.equal(store.getState().ui.notice, 'Could not reach Ollama.');

    // Opening Settings loads again: the same news is not raised twice.
    store.getState().setNotice(undefined);
    await store.getState().loadModels();
    assert.equal(store.getState().ui.notice, undefined);

    await store.getState().loadModels({ showErrors: true });
    assert.equal(store.getState().ui.notice, 'Could not reach Ollama.');
  } finally {
    restore();
  }
});

test('a server that answers with no models is named in the notice', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Ollama',
    baseUrl: 'http://localhost:3000',
  });
  // A web app's fallback page: a 200, and no model list in it.
  const restore = mockFetch(
    (async () => new Response('<!doctype html>', { status: 200 })) as never,
  );
  try {
    await store.getState().loadModels();
  } finally {
    restore();
  }
  assert.equal(store.getState().ui.notice, 'Could not load the model list from Ollama.');
});

test('a keyless server has a model to offer only once it has a model id', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  const endpoint = store.getState().addEndpoint({
    kind: 'openai-compatible',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
  });
  assert.equal(isEndpointConnected(endpoint), true);
  assert.equal(isEndpointUsable(endpoint, []), false);
  assert.equal(isEndpointUsable(endpoint, [{ endpointId: 'openrouter' }]), false);
  assert.equal(isEndpointUsable(endpoint, [{ endpointId: endpoint.id }]), true);
  assert.equal(isEndpointUsable({ ...endpoint, modelIds: ['qwen3:8b'] }, []), true);

  assert.equal(isEndpointUsable(OPENROUTER_ENDPOINT, []), false);
  await setKey(OPENROUTER_ENDPOINT.apiKeyRef!, 'sk-test');
  try {
    // A key is enough: its list may still be loading.
    assert.equal(isEndpointUsable(OPENROUTER_ENDPOINT, []), true);
  } finally {
    await deleteKey(OPENROUTER_ENDPOINT.apiKeyRef!);
  }
});

test('only an absolute http(s) address is a base URL', () => {
  assert.equal(isValidBaseUrl('http://localhost:11434/v1'), true);
  assert.equal(isValidBaseUrl('  https://example.com/v1/  '), true);
  assert.equal(isValidBaseUrl('not a url'), false);
  assert.equal(isValidBaseUrl('localhost:11434/v1'), false);
  assert.equal(isValidBaseUrl('/v1'), false);
  assert.equal(isValidBaseUrl('ftp://example.com'), false);
  assert.equal(isValidBaseUrl(''), false);
});

test('with nothing configured, loading models opens the setup sheet, but not over Settings', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  await store.getState().loadModels();
  assert.equal(store.getState().ui.setupOpen, true);

  const inSettings = createTestStore();
  inSettings.getState().setUI({ showSettings: true });
  await inSettings.getState().loadModels();
  assert.notEqual(inSettings.getState().ui.setupOpen, true);
});

test('a dismissed setup sheet stays shut on the next load, until a send asks for it', async () => {
  resetEndpointRegistryForTest();
  const first = createTestStore();
  await first.getState().loadModels();
  assert.equal(selectSetupSheetOpen(first.getState()), true);
  // Not now.
  first.getState().setUI({ setupOpen: false, setupDismissed: true });

  // A reload: the dismissal is persisted, and the load that opens the sheet by itself is quiet.
  const reloaded = createTestStore();
  reloaded.setState(
    mergePersistedState(reloaded.getState(), buildPersistedState(first.getState()) as never),
  );
  await reloaded.getState().loadModels();
  assert.equal(selectSetupSheetOpen(reloaded.getState()), false);

  // Sending with no key is asking for it.
  const auth = resolveSingleModelAuth({
    modelId: 'openai/gpt-4o',
    modelIndex: reloaded.getState().modelIndex,
    set: reloaded.setState,
    get: reloaded.getState,
  });
  assert.equal(auth, null);
  assert.equal(selectSetupSheetOpen(reloaded.getState()), true);
});

test('a first visit meets the setup sheet, then the tour, never both at once', async () => {
  resetEndpointRegistryForTest();
  const store = createTestStore();
  const showing = () => ({
    setup: selectSetupSheetOpen(store.getState()),
    tour: selectIntroTourOpen(store.getState()),
  });
  // Before the models load, nothing is known yet: the tour waits for setup.
  assert.deepEqual(showing(), { setup: false, tour: false });
  await store.getState().loadModels();
  assert.deepEqual(showing(), { setup: true, tour: false });
  store.getState().setUI({ setupOpen: false, setupDismissed: true });
  assert.deepEqual(showing(), { setup: false, tour: true });
  store.getState().setUI({ introSeen: true });
  assert.deepEqual(showing(), { setup: false, tour: false });
});

test('with a provider already connected, the tour needs no setup first', () => {
  const store = createTestStore();
  store.setState({ models: [{ id: 'openai/gpt-4o' } as never] });
  assert.equal(selectIntroTourOpen(store.getState()), true);
});

test('a built-in provider is connected once it holds a key, and not before', async () => {
  assert.equal(isEndpointConnected(OPENROUTER_ENDPOINT), false);
  await setKey(OPENROUTER_ENDPOINT.apiKeyRef!, 'sk-test');
  try {
    assert.equal(isEndpointConnected(OPENROUTER_ENDPOINT), true);
  } finally {
    await deleteKey(OPENROUTER_ENDPOINT.apiKeyRef!);
  }
  assert.equal(isEndpointConnected(OPENROUTER_ENDPOINT), false);
});
