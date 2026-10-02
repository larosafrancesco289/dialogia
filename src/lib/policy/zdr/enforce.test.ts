import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardModelOrNotice } from './enforce';
import { evaluateZdrModel, isLocalServer, ZDR_UNAVAILABLE_NOTICE, type ZdrLists } from './index';
import { guardZdrOrNotifyCached } from './cache';
import { setCustomEndpoints } from '@/lib/transport/endpointRegistry';
import { createTestStoreState } from '../../../../tests/helpers/createTestStoreState';

const lists = (modelIds: string[], providerIds: string[]): ZdrLists => ({
  modelIds: new Set(modelIds),
  providerIds: new Set(providerIds),
});

test('evaluateZdrModel prefers the model list, then the provider list', () => {
  const cases: Array<[string, ZdrLists, ReturnType<typeof evaluateZdrModel>]> = [
    ['provider/model-a', lists(['provider/model-a'], []), { status: 'allowed' }],
    // The model list wins even when the provider is listed.
    [
      'provider/model-b',
      lists(['provider/model-a'], ['provider']),
      { status: 'forbidden', reason: 'model' },
    ],
    ['other/model-x', lists([], ['other']), { status: 'allowed' }],
    ['else/model-x', lists([], ['other']), { status: 'forbidden', reason: 'provider' }],
    ['any/model', lists([], []), { status: 'unknown' }],
    ['   ', lists(['provider/model-a'], []), { status: 'forbidden', reason: 'model' }],
  ];
  for (const [modelId, zdr, expected] of cases) {
    assert.deepEqual(evaluateZdrModel(modelId, zdr), expected, modelId);
  }
});

test('guardModelOrNotice blocks a disallowed provider with a notice and caches the lists', () => {
  const { state, set } = createTestStoreState();
  const allowed = guardModelOrNotice(
    'other/model',
    set,
    lists([], ['provider']),
    state.setNotice,
    'Other Model',
  );
  assert.equal(allowed, false);
  assert.equal(
    state.ui.notice,
    'Other Model does not promise zero data retention. Pick another model, or turn off Zero data retention only in Settings › Models.',
  );
  assert.deepEqual(state.zdrProviderIds, ['provider']);
});

test('guardModelOrNotice passes allowed models through without a notice', () => {
  const { state, set } = createTestStoreState();
  const allowed = guardModelOrNotice(
    'provider/model',
    set,
    lists(['provider/model'], []),
    state.setNotice,
    'Model',
  );
  assert.equal(allowed, true);
  assert.deepEqual(state.zdrModelIds, ['provider/model']);
  assert.equal(state.ui.notice, undefined);
});

test('guardModelOrNotice refuses a missing model id', () => {
  const { state, set } = createTestStoreState();
  const allowed = guardModelOrNotice(' ', set, lists(['provider/model'], []), state.setNotice, '');
  assert.equal(allowed, false);
  assert.equal(state.ui.notice, ZDR_UNAVAILABLE_NOTICE);
});

test('the person’s own server on this machine or network passes zero data retention; one elsewhere does not', () => {
  const server = (baseUrl: string) => ({ kind: 'openai-compatible' as const, baseUrl });
  for (const url of [
    'http://localhost:11434/v1',
    'http://127.0.0.1:1234/v1',
    'http://[::1]:8000/v1',
    'http://192.168.1.20:8080/v1',
    'http://10.0.0.5/v1',
    'http://172.20.1.1/v1',
    'http://gpu-box.local:11434/v1',
  ]) {
    assert.equal(isLocalServer(server(url)), true, url);
  }
  for (const url of ['https://api.groq.com/openai/v1', 'http://172.32.0.1/v1', 'not a url']) {
    assert.equal(isLocalServer(server(url)), false, url);
  }
  assert.equal(isLocalServer({ kind: 'openrouter', baseUrl: 'http://localhost/v1' }), false);

  setCustomEndpoints([
    { id: 'mock', kind: 'openai-compatible', label: 'Mock', baseUrl: 'http://localhost:3999/v1' },
    { id: 'far', kind: 'openai-compatible', label: 'Far', baseUrl: 'https://api.example.com/v1' },
  ]);
  try {
    // Allowed whatever the lists say, even when they could not be fetched.
    assert.deepEqual(evaluateZdrModel('endpoint:mock/mock-slow', lists([], [])), {
      status: 'allowed',
    });
    assert.deepEqual(evaluateZdrModel('endpoint:far/model', lists(['provider/model-a'], [])), {
      status: 'forbidden',
      reason: 'model',
    });
  } finally {
    setCustomEndpoints([]);
  }
});

test('a refused model off the list is named as its server writes it', () => {
  setCustomEndpoints([
    { id: 'far', kind: 'openai-compatible', label: 'Far', baseUrl: 'https://api.example.com/v1' },
  ]);
  try {
    const { state, set } = createTestStoreState();
    state.zdrModelIds = ['provider/model-a'];
    const allowed = guardZdrOrNotifyCached('endpoint:far/mock-slow', set, () => state);
    assert.equal(allowed, false);
    assert.match(String(state.ui.notice), /^mock-slow does not promise/);
  } finally {
    setCustomEndpoints([]);
  }
});
