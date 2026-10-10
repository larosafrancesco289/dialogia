import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { isEndpointUsable } from '@/lib/auth/require';
import { deleteKey, getKey, isKeyRejected, markKeyRejected, setKey } from '@/lib/keys/store';
import { keyChoiceFor, looksLikeKey, serverName } from '@/components/connect/useConnectProvider';
import { createTestStore } from './helpers/createTestStoreState';
import { mockFetch } from './helpers/mockFetch';

test('a key pasted under the other provider goes where its prefix says', () => {
  assert.equal(keyChoiceFor('openrouter', ' sk-ant-api03-x'), 'anthropic');
  assert.equal(keyChoiceFor('anthropic', 'sk-or-v1-x'), 'openrouter');
  assert.equal(keyChoiceFor('openrouter', 'something-else'), 'openrouter');
  assert.equal(keyChoiceFor('local', 'sk-ant-x'), 'local');
});

test('a server added by its address is named for what it is, else where it is', () => {
  assert.equal(serverName('http://localhost:11434/v1'), 'Ollama');
  assert.equal(serverName('http://127.0.0.1:1234/v1'), 'LM Studio');
  assert.equal(serverName('http://localhost:3999/v1'), 'localhost:3999');
  assert.equal(serverName('https://models.example.com/v1'), 'models.example.com');
});

test('a refused key no longer counts as a model on offer', async () => {
  const ref = OPENROUTER_ENDPOINT.apiKeyRef!;
  await setKey(ref, 'sk-or-refused');
  try {
    assert.equal(isEndpointUsable(OPENROUTER_ENDPOINT, []), true);
    markKeyRejected(ref, 'sk-or-refused');
    assert.equal(isEndpointUsable(OPENROUTER_ENDPOINT, []), false);
    await setKey(ref, 'sk-or-fresh');
    assert.equal(isEndpointUsable(OPENROUTER_ENDPOINT, []), true);
  } finally {
    await deleteKey(ref);
  }
});

test('a key that does not begin as the provider’s keys do is caught without a call', () => {
  assert.equal(looksLikeKey('openrouter', ' sk-or-v1-abc'), true);
  assert.equal(looksLikeKey('openrouter', 'my password'), false);
  assert.equal(looksLikeKey('anthropic', 'sk-ant-api03-x'), true);
  assert.equal(looksLikeKey('anthropic', 'sk-or-v1-abc'), false);
});

test('a key is checked with the provider before it is saved, and a refused one is never kept', async () => {
  const store = createTestStore();
  const ref = OPENROUTER_ENDPOINT.apiKeyRef!;
  const asked: string[] = [];
  const restore = mockFetch((async (url: string, init?: RequestInit) => {
    asked.push(String(url));
    const auth = new Headers(init?.headers).get('Authorization');
    return auth === 'Bearer sk-or-good'
      ? new Response(JSON.stringify({ data: { label: 'test' } }), { status: 200 })
      : new Response(JSON.stringify({ error: { message: 'User not found.', code: 401 } }), {
          status: 401,
        });
  }) as never);
  try {
    assert.equal(await store.getState().checkKey(OPENROUTER_ENDPOINT.id, 'sk-or-bad'), 'refused');
    assert.equal(getKey(ref), undefined, 'checking saves nothing');
    assert.equal(await store.getState().checkKey(OPENROUTER_ENDPOINT.id, 'sk-or-good'), 'accepted');
    // OpenRouter's model list is public, so the key's own record is asked.
    assert.ok(asked.every((url) => url.endsWith('/key')));
  } finally {
    restore();
  }
});

test('a key the provider cannot be asked about is not called refused', async () => {
  const store = createTestStore();
  const restore = mockFetch((async () => {
    throw new TypeError('Failed to fetch');
  }) as never);
  try {
    assert.equal(
      await store.getState().checkKey(OPENROUTER_ENDPOINT.id, 'sk-or-anything'),
      'unchecked',
    );
  } finally {
    restore();
  }
});

test('a server that cannot be reached is told apart from one that offers nothing', async () => {
  const store = createTestStore();
  let restore = mockFetch((async () => {
    throw new TypeError('Failed to fetch');
  }) as never);
  try {
    assert.equal(await store.getState().probeServer('http://localhost:11434/v1'), 'unreachable');
  } finally {
    restore();
  }
  restore = mockFetch((async () => new Response('{"data":[]}', { status: 200 })) as never);
  try {
    assert.equal(await store.getState().probeServer('http://localhost:11434/v1'), 'empty');
  } finally {
    restore();
  }
});

test('a saved key refused since says so in the connect box alone, with no toast over it', async () => {
  const store = createTestStore();
  const ref = OPENROUTER_ENDPOINT.apiKeyRef!;
  await setKey(ref, 'sk-or-revoked');
  const restore = mockFetch(
    (async () =>
      new Response(JSON.stringify({ error: { message: 'User not found.', code: 401 } }), {
        status: 401,
      })) as never,
  );
  try {
    await store.getState().loadModels();
    assert.equal(isKeyRejected(ref), true);
    assert.equal(store.getState().ui.notice, undefined);
  } finally {
    restore();
    await deleteKey(ref);
  }
});
