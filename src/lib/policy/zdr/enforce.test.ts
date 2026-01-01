import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeZdrFilter, guardModelOrNotice } from './enforce';

const mergeState = (target: any, patch: any) => {
  if (!patch) return;
  Object.entries(patch).forEach(([key, value]) => {
    target[key] = value;
  });
};

test('computeZdrFilter enforces allowed models', async () => {
  const models = [{ id: 'allowed' }, { id: 'blocked' }];
  const result = await computeZdrFilter(models, 'enforce', {
    modelIds: ['allowed'],
    providerIds: [],
  });
  assert.equal(result.filter.status, 'model');
  assert.deepEqual(
    result.filtered.map((m) => m.id),
    ['allowed'],
  );
});

test('guardModelOrNotice updates notice for disallowed providers', () => {
  const state: any = {
    ui: { notice: undefined },
    zdrModelIds: [],
    zdrProviderIds: [],
  };
  const setNotice = (notice?: string) => {
    state.ui.notice = notice;
  };
  const set = (updater: any) => {
    const patch = updater(state);
    mergeState(state, patch);
  };
  const lists = {
    modelIds: new Set<string>(),
    providerIds: new Set<string>(['provider']),
  };
  const allowed = guardModelOrNotice('other/model', set, lists, setNotice);
  assert.equal(allowed, false);
  assert.ok(state.ui.notice?.includes('not from a ZDR provider'));
  assert.deepEqual(state.zdrProviderIds, Array.from(lists.providerIds));
});

test('guardModelOrNotice passes allowed models through', () => {
  const state: any = {
    ui: { notice: undefined },
    zdrModelIds: [],
    zdrProviderIds: [],
  };
  const setNotice = (notice?: string) => {
    state.ui.notice = notice;
  };
  const set = (updater: any) => {
    const patch = updater(state);
    mergeState(state, patch);
  };
  const lists = {
    modelIds: new Set<string>(['provider/model']),
    providerIds: new Set<string>(),
  };
  const allowed = guardModelOrNotice('provider/model', set, lists, setNotice);
  assert.equal(allowed, true);
  assert.deepEqual(state.zdrModelIds, Array.from(lists.modelIds));
  assert.equal(state.ui.notice, undefined);
});
