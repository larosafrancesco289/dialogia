import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardModelOrNotice } from './enforce';
import { evaluateZdrModel, ZDR_UNAVAILABLE_NOTICE, type ZdrLists } from './index';
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
  const allowed = guardModelOrNotice('other/model', set, lists([], ['provider']), state.setNotice);
  assert.equal(allowed, false);
  assert.ok(state.ui.notice?.includes('not from a ZDR provider'));
  assert.deepEqual(state.zdrProviderIds, ['provider']);
});

test('guardModelOrNotice passes allowed models through without a notice', () => {
  const { state, set } = createTestStoreState();
  const allowed = guardModelOrNotice(
    'provider/model',
    set,
    lists(['provider/model'], []),
    state.setNotice,
  );
  assert.equal(allowed, true);
  assert.deepEqual(state.zdrModelIds, ['provider/model']);
  assert.equal(state.ui.notice, undefined);
});

test('guardModelOrNotice refuses a missing model id', () => {
  const { state, set } = createTestStoreState();
  const allowed = guardModelOrNotice(' ', set, lists(['provider/model'], []), state.setNotice);
  assert.equal(allowed, false);
  assert.equal(state.ui.notice, ZDR_UNAVAILABLE_NOTICE);
});
