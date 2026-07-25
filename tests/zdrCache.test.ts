import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  refreshZdrListsIfNeeded,
  computeZdrFilterCached,
  guardZdrOrNotifyCached,
} from '@/lib/policy/zdr/cache';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import { createModelIndex } from '@/lib/models';
import { ZDR_UNAVAILABLE_NOTICE } from '@/lib/policy/zdr';
import type { ZdrFetchers } from '@/lib/policy/zdr';
import { createTestStoreState } from './helpers/createTestStoreState';

function createStore(): { state: any; set: StoreSetter; get: StoreGetter } {
  const { state, set, get } = createTestStoreState();
  state.modelIndex = createModelIndex([]);
  return { state, set, get };
}

const createFetchers = (models: string[], providers: string[]) => {
  const calls = { lists: 0 };
  const fetchers: ZdrFetchers = {
    fetchLists: async () => {
      calls.lists += 1;
      return { modelIds: new Set(models), providerIds: new Set(providers) };
    },
  };
  return { fetchers, calls };
};

test('refreshZdrListsIfNeeded reuses fresh cache without fetching', async () => {
  const { state, set, get } = createStore();
  state.zdrModelIds = ['provider/model'];
  state.zdrProviderIds = ['provider'];
  state.zdrFetchedAt = Date.now() - 1_000; // fresh

  const fetchers = createFetchers([], []);

  const lists = await refreshZdrListsIfNeeded(set, get, fetchers.fetchers);

  assert.equal(fetchers.calls.lists, 0);
  assert.ok(lists.modelIds.has('provider/model'));
  assert.ok(lists.providerIds.has('provider'));
});

test('refreshZdrListsIfNeeded refreshes when cache stale', async () => {
  const { state, set, get } = createStore();
  state.zdrModelIds = ['old/model'];
  state.zdrProviderIds = ['old'];
  state.zdrFetchedAt = Date.now() - 1000 * 60 * 60 * 24; // stale (24h)

  const fetchers = createFetchers(['new/model'], ['new']);

  const before = Date.now();
  const lists = await refreshZdrListsIfNeeded(set, get, fetchers.fetchers);
  const after = Date.now();

  assert.equal(fetchers.calls.lists, 1);
  assert.ok(lists.modelIds.has('new/model'));
  assert.ok(state.zdrModelIds?.includes('new/model'));
  assert.ok(state.zdrProviderIds?.includes('new'));
  assert.ok(typeof state.zdrFetchedAt === 'number');
  assert.ok((state.zdrFetchedAt ?? 0) >= before && (state.zdrFetchedAt ?? 0) <= after);
});

test('guardZdrOrNotifyCached refreshes stale cache and posts notice when blocked', async () => {
  const { state, set, get } = createStore();
  state.zdrModelIds = [];
  state.zdrProviderIds = [];
  state.zdrFetchedAt = Date.now() - 1000 * 60 * 60 * 24;
  state.ui = {} as any;

  const fetchers = createFetchers([], []);
  const allowed = await guardZdrOrNotifyCached('provider/model', set, get, fetchers.fetchers);

  assert.equal(allowed, false);
  assert.equal(fetchers.calls.lists, 1);
  assert.equal(state.ui.notice, ZDR_UNAVAILABLE_NOTICE);
});

test('computeZdrFilterCached uses fresh cache without refetching', async () => {
  const { state, set, get } = createStore();
  state.zdrModelIds = ['provider/model'];
  state.zdrProviderIds = ['provider'];
  state.zdrFetchedAt = Date.now() - 5_000;

  const fetchers = createFetchers(['provider/model'], []);

  const result = await computeZdrFilterCached(
    [{ id: 'provider/model' }],
    'informational',
    set,
    get,
    fetchers.fetchers,
  );

  assert.equal(fetchers.calls.lists, 0);
  assert.equal(result.filter.status, 'model');
});

test('refreshZdrListsIfNeeded dedupes concurrent refreshes into one fetch', async () => {
  const { state, set, get } = createStore();
  state.zdrModelIds = [];
  state.zdrProviderIds = [];
  state.zdrFetchedAt = undefined;

  let calls = 0;
  const fetchers: ZdrFetchers = {
    fetchLists: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { modelIds: new Set(['provider/model']), providerIds: new Set(['provider']) };
    },
  };

  const [first, second] = await Promise.all([
    refreshZdrListsIfNeeded(set, get, fetchers),
    refreshZdrListsIfNeeded(set, get, fetchers),
  ]);

  assert.equal(calls, 1);
  assert.ok(first.modelIds.has('provider/model'));
  assert.equal(first, second);
});
