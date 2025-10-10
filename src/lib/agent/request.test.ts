import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  providerSortFromRoutePref,
  composePlugins,
  buildDebugBody,
  pdfPlugins,
  recordDebugIfEnabled,
  DEBUG_LOG_TTL_MS,
  DEBUG_LOG_MAX_ENTRIES,
} from './request';
import { ProviderSort } from '@/lib/models/providerSort';
import type { StoreAccess } from '@/lib/agent/types';

const createTestStore = (initialUi: any): StoreAccess & { state: { ui: any } } => {
  const store = {
    state: { ui: initialUi },
    get() {
      return store.state;
    },
    set(update: any) {
      if (!update) return;
      const next = typeof update === 'function' ? update(store.state) : update;
      if (next) {
        store.state = { ...store.state, ...next };
      }
    },
  };
  return store as StoreAccess & { state: { ui: any } };
};

test('providerSortFromRoutePref maps UI preferences to provider sort', () => {
  assert.equal(providerSortFromRoutePref('speed'), ProviderSort.Throughput);
  assert.equal(providerSortFromRoutePref('cost'), ProviderSort.Price);
  assert.equal(providerSortFromRoutePref(undefined), undefined);
  assert.equal(providerSortFromRoutePref(null as any), undefined);
});

test('pdfPlugins emits parser plugin only when PDFs are present', () => {
  assert.deepEqual(pdfPlugins(false), undefined);
  assert.deepEqual(pdfPlugins(true), [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }]);
});

test('composePlugins merges pdf parser and OpenRouter web plugin', () => {
  assert.deepEqual(composePlugins({ hasPdf: false, searchEnabled: false }), undefined);
  assert.deepEqual(composePlugins({ hasPdf: true, searchEnabled: false }), [
    { id: 'file-parser', pdf: { engine: 'pdf-text' } },
  ]);
  assert.deepEqual(
    composePlugins({ hasPdf: false, searchEnabled: true, searchProvider: 'openrouter' }),
    [{ id: 'web' }],
  );
  assert.deepEqual(
    composePlugins({ hasPdf: true, searchEnabled: true, searchProvider: 'openrouter' }),
    [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }, { id: 'web' }],
  );
});

test('buildDebugBody includes optional knobs when provided', () => {
  const body = buildDebugBody({
    modelId: 'provider/model',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
    includeUsage: true,
    temperature: 0.5,
    top_p: 0.9,
    max_tokens: 256,
    reasoningEffort: 'medium',
    reasoningTokens: 1024,
    tools: [
      {
        type: 'function',
        function: {
          name: 'tutor_call',
          parameters: { type: 'object', properties: {} },
        },
      },
    ],
    toolChoice: 'auto',
    providerSort: ProviderSort.Price,
    plugins: [{ id: 'web' }],
    canImageOut: true,
  });

  assert.equal(body.model, 'provider/model');
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.deepEqual(body.modalities, ['image', 'text']);
  assert.equal(body.temperature, 0.5);
  assert.equal(body.top_p, 0.9);
  assert.equal(body.max_tokens, 256);
  assert.deepEqual(body.reasoning, { effort: 'medium', max_tokens: 1024 });
  assert.equal(body.tools?.[0]?.function?.name, 'tutor_call');
  assert.equal(body.tool_choice, 'auto');
  assert.deepEqual(body.provider, { sort: 'price' });
  assert.deepEqual(body.plugins, [{ id: 'web' }]);
});

test('recordDebugIfEnabled prunes stale debug entries', () => {
  const now = Date.now();
  const store = createTestStore({
    debugMode: true,
    debugByMessageId: {
      stale: { body: 'old', createdAt: now - DEBUG_LOG_TTL_MS - 10 },
      fresh: { body: 'fresh', createdAt: now - 5000 },
    },
  });
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    recordDebugIfEnabled(store, 'new', { ok: true });
  } finally {
    Date.now = originalNow;
  }
  const entries = store.state.ui.debugByMessageId;
  assert.deepEqual(Object.keys(entries).sort(), ['fresh', 'new']);
  assert.equal(typeof entries.new.body, 'string');
});

test('recordDebugIfEnabled caps debug entries to the configured limit', () => {
  const store = createTestStore({ debugMode: true, debugByMessageId: {} });
  const originalNow = Date.now;
  let current = Date.now();
  try {
    for (let i = 0; i < DEBUG_LOG_MAX_ENTRIES + 5; i += 1) {
      current += 1000;
      Date.now = () => current;
      recordDebugIfEnabled(store, `id-${i}`, { index: i });
    }
  } finally {
    Date.now = originalNow;
  }
  const entries = store.state.ui.debugByMessageId;
  const keys = Object.keys(entries);
  assert.equal(keys.length, DEBUG_LOG_MAX_ENTRIES);
  assert.equal(keys.includes(`id-${DEBUG_LOG_MAX_ENTRIES + 4}`), true);
  assert.equal(keys.includes('id-0'), false);
});
