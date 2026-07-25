import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEndpointProxied } from '@/lib/auth/require';
import { deleteKey, setKey } from '@/lib/keys/store';
import { OPENROUTER_ENDPOINT, type ProviderEndpoint } from '@/lib/transport/endpoints';

const local: ProviderEndpoint = {
  id: 'ollama',
  kind: 'openai-compatible',
  label: 'Ollama',
  baseUrl: 'http://localhost:11434/v1',
};

test('a user-configured endpoint is never spending the deployment key', () => {
  assert.equal(isEndpointProxied(local), false);
});

test('a proxied built-in stops being proxied once the user supplies a key', async () => {
  const proxied = { ...OPENROUTER_ENDPOINT, useProxy: true };
  assert.equal(isEndpointProxied(proxied), true);
  await setKey('openrouter', 'sk-or-mine');
  try {
    assert.equal(isEndpointProxied(proxied), false);
  } finally {
    await deleteKey('openrouter');
  }
});
