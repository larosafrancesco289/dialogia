import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_DB_NAME,
  deleteKey,
  describeKey,
  getKey,
  hasKey,
  listKeyRefs,
  loadKeys,
  resetKeyStoreForTest,
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

test('a key pasted while the warm-up read is in flight survives it', async () => {
  // The read builds a fresh map from the database; without the in-flight guard
  // it lands after the paste and evicts it, and the user sees an app that
  // insists it has no key seconds after they gave it one.
  let release: (records: never[]) => void = () => {};
  const pending = new Promise<never[]>((resolve) => {
    release = resolve;
  });
  resetKeyStoreForTest({
    toArray: () => pending as Promise<never[]>,
    put: async () => {},
    delete: async () => {},
  });

  const warming = loadKeys();
  await setKey('openrouter', 'sk-or-pasted');
  release([]);
  await warming;

  assert.equal(getKey('openrouter'), 'sk-or-pasted');
  resetKeyStoreForTest();
});

test('a key removed while the warm-up read is in flight stays removed', async () => {
  const stored = [{ ref: 'openrouter', value: 'sk-or-old', updatedAt: 1 }];
  let release: () => void = () => {};
  const pending = new Promise<typeof stored>((resolve) => {
    release = () => resolve(stored);
  });
  resetKeyStoreForTest({
    toArray: () => pending,
    put: async () => {},
    delete: async () => {},
  });

  const warming = loadKeys();
  await setKey('openrouter', 'sk-or-old');
  await deleteKey('openrouter');
  release();
  await warming;

  assert.equal(hasKey('openrouter'), false);
  resetKeyStoreForTest();
});
