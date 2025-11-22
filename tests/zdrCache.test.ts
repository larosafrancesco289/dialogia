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

const createFetchers = (models: string[], providers: string[]) => {
  const calls = { models: 0, providers: 0 };
  const fetchers: ZdrFetchers = {
    fetchModelIds: async () => {
      calls.models += 1;
      return new Set(models);
    },
    fetchProviderIds: async () => {
      calls.providers += 1;
      return new Set(providers);
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

  assert.equal(fetchers.calls.models, 0);
  assert.equal(fetchers.calls.providers, 0);
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

  assert.equal(fetchers.calls.models, 1);
  assert.equal(fetchers.calls.providers, 1);
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
  assert.equal(fetchers.calls.models, 1);
  assert.equal(fetchers.calls.providers, 1);
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

  assert.equal(fetchers.calls.models, 0);
  assert.equal(fetchers.calls.providers, 0);
  assert.equal(result.filter.status, 'model');
});
