import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listSearchModeOptions } from '@/lib/search/ui/modes';
import { NATIVE_SEARCH_MODE } from '@/lib/search/providers/types';
import { OPENROUTER_ENDPOINT, type ProviderEndpoint } from '@/lib/transport/endpoints';

const ollama: ProviderEndpoint = {
  id: 'ollama',
  kind: 'openai-compatible',
  label: 'Ollama',
  baseUrl: 'http://localhost:11434/v1',
};

test('a built-in provider offers its own search', () => {
  assert.deepEqual(
    listSearchModeOptions(OPENROUTER_ENDPOINT).map((option) => option.mode),
    [NATIVE_SEARCH_MODE],
  );
});

test("a user's server is never offered the provider's own search, which its request never carries", () => {
  assert.deepEqual(listSearchModeOptions(ollama), []);
  // With tools on, only a search provider holding a key could search, and none does here.
  assert.deepEqual(listSearchModeOptions({ ...ollama, capabilities: { tools: true } }), []);
});
