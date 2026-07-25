import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followUpPrompt } from '@/lib/agent/prompts/followUp';
import { NATIVE_SEARCH_MODE } from '@/lib/search/providers';

const CITE_SOURCES = 'Write the final answer. Cite sources inline as [n].';

test('the follow-up prompt asks for citations after any tool-based search', () => {
  assert.equal(followUpPrompt({ searchEnabled: true, searchProvider: 'tavily' }), CITE_SOURCES);
  // Open by design: a provider registered later must not silently lose the
  // citation instruction the way a hard-coded 'tavily' check would make it.
  assert.equal(followUpPrompt({ searchEnabled: true, searchProvider: 'exa' }), CITE_SOURCES);
});

test('provider-native search leaves the follow-up prompt alone', () => {
  // Native search grounds the answer inside the model call; there is no
  // numbered source list for the model to cite.
  assert.notEqual(
    followUpPrompt({ searchEnabled: true, searchProvider: NATIVE_SEARCH_MODE }),
    CITE_SOURCES,
  );
  assert.notEqual(followUpPrompt({ searchEnabled: false, searchProvider: 'tavily' }), CITE_SOURCES);
});
