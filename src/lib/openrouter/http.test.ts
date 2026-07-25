import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orChatCompletions, orFetchModels, orFetchZdrEndpoints } from '@/lib/openrouter/http';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { mockFetch } from '../../../tests/helpers/mockFetch';
import { fakeBrowser } from '../../../tests/helpers/fakeBrowser';

function capture() {
  const seen = { url: '', headers: {} as Record<string, string> };
  const restore = mockFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.url = String(input);
    seen.headers = (init?.headers ?? {}) as Record<string, string>;
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  }) as never);
  return { seen, restore };
}

test('a BYOK OpenRouter call sends the key and the courtesy headers', async () => {
  const { seen, restore } = capture();
  try {
    await orFetchModels({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'sk-or-test' });
  } finally {
    restore();
  }
  assert.ok(seen.url.startsWith('https://openrouter.ai/api/v1'));
  assert.equal(seen.headers.Authorization, 'Bearer sk-or-test');
  assert.equal(seen.headers['X-Title'], 'Dialogia');
});

test('a proxied call carries no client credentials at all', async () => {
  const { seen, restore } = capture();
  const restoreWindow = fakeBrowser();
  try {
    await orChatCompletions({
      auth: { endpoint: { ...OPENROUTER_ENDPOINT, useProxy: true } },
      body: { model: 'x', messages: [], stream: false },
    });
  } finally {
    restoreWindow();
    restore();
  }
  assert.ok(seen.url.startsWith('/api/openrouter'));
  assert.equal(seen.headers.Authorization, undefined);
});

test('the unauthenticated ZDR list resolves absolutely outside a browser', async () => {
  // The hosted worker's own ZDR route calls this with the proxy flag inlined as
  // true; `/api/openrouter/...` is unfetchable there.
  const previous = process.env.VITE_USE_OR_PROXY;
  process.env.VITE_USE_OR_PROXY = 'true';
  const { seen, restore } = capture();
  try {
    await orFetchZdrEndpoints();
  } finally {
    restore();
    if (previous === undefined) delete process.env.VITE_USE_OR_PROXY;
    else process.env.VITE_USE_OR_PROXY = previous;
  }
  assert.equal(seen.url, 'https://openrouter.ai/api/v1/endpoints/zdr');
});

test('a user endpoint uses its own base URL and drops the OpenRouter courtesy headers', async () => {
  const { seen, restore } = capture();
  try {
    await orChatCompletions({
      auth: {
        endpoint: {
          id: 'ollama',
          kind: 'openai-compatible',
          label: 'Ollama',
          baseUrl: 'http://localhost:11434/v1',
        },
      },
      body: { model: 'ollama/qwen3', messages: [], stream: false },
    });
  } finally {
    restore();
  }
  assert.equal(seen.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(seen.headers['X-Title'], undefined);
  assert.equal(seen.headers['HTTP-Referer'], undefined);
  // A local server usually has no key at all, and must not be refused for it.
  assert.equal(seen.headers.Authorization, undefined);
});

test('a key the user pasted wins over the deployment proxy', async () => {
  const { seen, restore } = capture();
  try {
    await orChatCompletions({
      auth: { endpoint: { ...OPENROUTER_ENDPOINT, useProxy: true }, apiKey: 'sk-or-mine' },
      body: { model: 'x', messages: [], stream: false },
    });
  } finally {
    restore();
  }
  assert.ok(seen.url.startsWith('https://openrouter.ai/api/v1'));
  assert.equal(seen.headers.Authorization, 'Bearer sk-or-mine');
});
