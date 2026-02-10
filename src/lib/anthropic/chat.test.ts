import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnthropicDirectModelId } from '@/lib/anthropic/chat';

test('resolveAnthropicDirectModelId maps current aliases to direct IDs', () => {
  assert.equal(resolveAnthropicDirectModelId('claude-opus-4-6'), 'claude-opus-4-6');
  assert.equal(resolveAnthropicDirectModelId('claude-sonnet-4.5'), 'claude-sonnet-4-5-20250929');
  assert.equal(resolveAnthropicDirectModelId('claude-haiku-4.5'), 'claude-haiku-4-5-20251001');
});

test('resolveAnthropicDirectModelId maps legacy aliases to direct IDs', () => {
  assert.equal(resolveAnthropicDirectModelId('claude-opus-4-5'), 'claude-opus-4-5-20251101');
  assert.equal(resolveAnthropicDirectModelId('claude-opus-4-1'), 'claude-opus-4-1-20250805');
  assert.equal(resolveAnthropicDirectModelId('claude-sonnet-4-0'), 'claude-sonnet-4-20250514');
  assert.equal(resolveAnthropicDirectModelId('claude-opus-4-0'), 'claude-opus-4-20250514');
  assert.equal(resolveAnthropicDirectModelId('claude-3-7-sonnet-latest'), 'claude-3-7-sonnet-latest');
});

test('resolveAnthropicDirectModelId accepts snapshot IDs as-is', () => {
  assert.equal(
    resolveAnthropicDirectModelId('claude-sonnet-4-20250514'),
    'claude-sonnet-4-20250514',
  );
  assert.equal(resolveAnthropicDirectModelId('claude-3-haiku-20240307'), 'claude-3-haiku-20240307');
});

test('resolveAnthropicDirectModelId strips anthropic prefix', () => {
  assert.equal(
    resolveAnthropicDirectModelId('anthropic/claude-sonnet-4-5'),
    'claude-sonnet-4-5-20250929',
  );
});

test('resolveAnthropicDirectModelId returns undefined for unknown aliases', () => {
  assert.equal(resolveAnthropicDirectModelId('claude-sonnet-5'), undefined);
  assert.equal(resolveAnthropicDirectModelId('anthropic/foo'), undefined);
});
