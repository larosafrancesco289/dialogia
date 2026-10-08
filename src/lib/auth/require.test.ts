import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireModelAuth } from '@/lib/auth/require';
import { deleteKey, setKey } from '@/lib/keys/store';
import { createModelIndex } from '@/lib/models';
import { ANTHROPIC_ENDPOINT_ID, OPENROUTER_ENDPOINT_ID } from '@/lib/transport/endpoints';

const NO_MODELS = createModelIndex([]);

test('before the list loads, a Claude id goes to OpenRouter when only OpenRouter has a key', async () => {
  await setKey('openrouter', 'sk-or-test');
  try {
    const auth = requireModelAuth('anthropic/claude-haiku-5.5', NO_MODELS);
    assert.equal(auth.endpoint?.id, OPENROUTER_ENDPOINT_ID);
  } finally {
    await deleteKey('openrouter');
  }
});

test('with both keys a Claude id stays on OpenRouter, where the loaded list sends it', async () => {
  await setKey('anthropic', 'sk-ant-test');
  await setKey('openrouter', 'sk-or-test');
  try {
    assert.equal(
      requireModelAuth('anthropic/claude-haiku-5.5', NO_MODELS).endpoint?.id,
      OPENROUTER_ENDPOINT_ID,
    );
  } finally {
    await deleteKey('openrouter');
  }
  try {
    // A Claude key alone keeps it on the Claude API.
    assert.equal(
      requireModelAuth('anthropic/claude-haiku-5.5', NO_MODELS).endpoint?.id,
      ANTHROPIC_ENDPOINT_ID,
    );
  } finally {
    await deleteKey('anthropic');
  }
  await setKey('openrouter', 'sk-or-test');
  try {
    // A direct id never moves.
    assert.throws(() => requireModelAuth('anthropic-direct/claude-haiku-5-5', NO_MODELS));
  } finally {
    await deleteKey('openrouter');
  }
});
