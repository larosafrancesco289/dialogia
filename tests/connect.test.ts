import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { isEndpointUsable } from '@/lib/auth/require';
import { deleteKey, markKeyRejected, setKey } from '@/lib/keys/store';
import { keyChoiceFor, serverName } from '@/components/connect/useConnectProvider';

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
