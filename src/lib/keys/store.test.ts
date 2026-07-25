import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_DB_NAME,
  deleteKey,
  describeKey,
  getKey,
  hasKey,
  listKeyRefs,
  setKey,
  subscribeToKeys,
} from '@/lib/keys/store';

test('keys live in a database of their own, apart from the chat data', () => {
  // Structural, not incidental: exportAll walks the `dialogia` database, so a
  // separate one is what makes "keys are never exported" true by construction.
  assert.equal(KEY_DB_NAME, 'dialogia-keys');
});

test('a stored key is readable synchronously and described without exposing it', async () => {
  await setKey('probe', 'sk-or-v1-abcdefgh');
  try {
    assert.equal(getKey('probe'), 'sk-or-v1-abcdefgh');
    assert.equal(hasKey('probe'), true);
    assert.equal(describeKey('probe'), '••••efgh');
    assert.ok(listKeyRefs().includes('probe'));
  } finally {
    await deleteKey('probe');
  }
  assert.equal(hasKey('probe'), false);
});

test('an empty value removes the key rather than storing a blank one', async () => {
  await setKey('probe', 'value');
  await setKey('probe', '   ');
  assert.equal(hasKey('probe'), false);
});

test('subscribers are told when a key appears or goes away', async () => {
  let calls = 0;
  const unsubscribe = subscribeToKeys(() => {
    calls += 1;
  });
  await setKey('probe', 'value');
  await deleteKey('probe');
  unsubscribe();
  await setKey('probe', 'value');
  await deleteKey('probe');
  assert.equal(calls, 2);
});
