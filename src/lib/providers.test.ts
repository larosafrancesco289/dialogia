import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelTransport } from '@/lib/providers';

test('resolveModelTransport treats legacy Anthropic ids as Anthropic transport', () => {
  assert.equal(resolveModelTransport('anthropic/claude-haiku-4.5'), 'anthropic');
  assert.equal(resolveModelTransport('anthropic-direct/claude-haiku-4.5'), 'anthropic');
  assert.equal(resolveModelTransport('openrouter/model'), 'openrouter');
});
