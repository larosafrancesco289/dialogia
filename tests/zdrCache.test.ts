import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { refreshZdrListsIfNeeded, ensureListsAndFilterCached, guardZdrOrNotify } from '@/lib/zdr/cache';
import * as openrouter from '@/lib/openrouter';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import { createModelIndex } from '@/lib/models';
import { ZDR_UNAVAILABLE_NOTICE } from '@/lib/zdr';

function createStore(): { state: any; set: StoreSetter; get: StoreGetter } {
  const state: any = {
    chats: [],
    folders: [],
    messages: {},
    selectedChatId: undefined,
    models: [],
    modelIndex: createModelIndex([]),
    favoriteModelIds: [],
    hiddenModelIds: [],
    ui: {} as any,
  };

  const set: StoreSetter = (updater) => {
    const patch = typeof updater === 'function' ? (updater as any)(state) : updater;
    if (!patch) return;
    Object.assign(state, patch);
  };

  const get: StoreGetter = () => state;

  return { state, set, get };
}

test('refreshZdrListsIfNeeded reuses fresh cache without fetching', async () => {
  const { state, set, get } = createStore();
  state.zdrModelIds = ['provider/model'];
  state.zdrProviderIds = ['provider'];
  state.zdrFetchedAt = Date.now() - 1_000; // fresh

  const modelsMock = mock.method(openrouter, 'fetchZdrModelIds', async () => new Set<string>());
  const providersMock = mock.method(openrouter, 'fetchZdrProviderIds', async () => new Set<string>());

  const lists = await refreshZdrListsIfNeeded(set, get);

  assert.equal(modelsMock.mock.calls.length, 0);
  assert.equal(providersMock.mock.calls.length, 0);
  assert.ok(lists.modelIds.has('provider/model'));
  assert.ok(lists.providerIds.has('provider'));

  modelsMock.mock.restore();
  providersMock.mock.restore();
});

test('refreshZdrListsIfNeeded refreshes when cache stale', async () => {
  const { state, set, get } = createStore();
  state.zdrModelIds = ['old/model'];
  state.zdrProviderIds = ['old'];
  state.zdrFetchedAt = Date.now() - 1000 * 60 * 60 * 24; // stale (24h)

  const modelsMock = mock.method(openrouter, 'fetchZdrModelIds', async () => new Set(['new/model']));
  const providersMock = mock.method(openrouter, 'fetchZdrProviderIds', async () => new Set(['new']));

  const before = Date.now();
  const lists = await refreshZdrListsIfNeeded(set, get);
  const after = Date.now();

  assert.equal(modelsMock.mock.calls.length, 1);
  assert.equal(providersMock.mock.calls.length, 1);
  assert.ok(lists.modelIds.has('new/model'));
  assert.ok(state.zdrModelIds?.includes('new/model'));
  assert.ok(state.zdrProviderIds?.includes('new'));
  assert.ok(typeof state.zdrFetchedAt === 'number');
  assert.ok((state.zdrFetchedAt ?? 0) >= before && (state.zdrFetchedAt ?? 0) <= after);

  modelsMock.mock.restore();
  providersMock.mock.restore();
});

test('guardZdrOrNotify refreshes stale cache and posts notice when blocked', async () => {
  const { state, set, get } = createStore();
  state.zdrModelIds = [];
  state.zdrProviderIds = [];
  state.zdrFetchedAt = Date.now() - 1000 * 60 * 60 * 24;
  state.ui = {} as any;

  const modelsMock = mock.method(openrouter, 'fetchZdrModelIds', async () => new Set<string>());
  const providersMock = mock.method(openrouter, 'fetchZdrProviderIds', async () => new Set<string>());

  const allowed = await guardZdrOrNotify('provider/model', set, get);

  assert.equal(allowed, false);
  assert.equal(modelsMock.mock.calls.length, 1);
  assert.equal(providersMock.mock.calls.length, 1);
  assert.equal(state.ui.notice, ZDR_UNAVAILABLE_NOTICE);

  modelsMock.mock.restore();
  providersMock.mock.restore();
});

test('ensureListsAndFilterCached uses fresh cache without refetching', async () => {
  const { state, set, get } = createStore();
  state.zdrModelIds = ['provider/model'];
  state.zdrProviderIds = ['provider'];
  state.zdrFetchedAt = Date.now() - 5_000;

  const modelsMock = mock.method(openrouter, 'fetchZdrModelIds', async () => new Set<string>());
  const providersMock = mock.method(openrouter, 'fetchZdrProviderIds', async () => new Set<string>());

  const result = await ensureListsAndFilterCached(
    [{ id: 'provider/model' }],
    'informational',
    set,
    get,
  );

  assert.equal(modelsMock.mock.calls.length, 0);
  assert.equal(providersMock.mock.calls.length, 0);
  assert.equal(result.filter.status, 'model');

  modelsMock.mock.restore();
  providersMock.mock.restore();
});
