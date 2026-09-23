import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNameFromId, formatModelLabel } from '@/lib/models/labels';

test('deriveNameFromId turns provider ids into readable names', () => {
  assert.equal(deriveNameFromId('anthropic/claude-opus-5-5'), 'Claude Opus 5.5');
  assert.equal(deriveNameFromId('openai/gpt-5.5'), 'GPT-5.5');
  assert.equal(deriveNameFromId('~openai/gpt-latest'), 'GPT Latest');
  assert.equal(deriveNameFromId('meta-llama/llama-4-70b-instruct'), 'Llama 4 70B Instruct');
  assert.equal(deriveNameFromId(''), '');
});

test('formatModelLabel prefers a real name and only humanizes id-shaped ones', () => {
  assert.equal(
    formatModelLabel({
      fallbackId: 'anthropic/claude-opus-5-5',
      fallbackName: 'Anthropic: Claude Opus 5.5',
    }),
    'Claude Opus 5.5',
  );
  assert.equal(formatModelLabel({ fallbackName: 'anthropic/claude-opus-5-5' }), 'Claude Opus 5.5');
  assert.equal(
    formatModelLabel({ fallbackName: 'endpoint:mock/claude-opus-5-5' }),
    'Claude Opus 5.5',
  );
  // A local server's model id is what the user typed; leave it alone.
  assert.equal(formatModelLabel({ fallbackName: 'llama-4-70b-instruct' }), 'llama-4-70b-instruct');
});
