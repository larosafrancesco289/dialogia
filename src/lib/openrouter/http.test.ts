import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orChatCompletions, orFetchModels } from '@/lib/openrouter/http';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { mockFetch } from '../../../tests/helpers/mockFetch';

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
