import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCuratedModelsByAvailability } from '@/lib/models/curatedAvailability';

test('filterCuratedModelsByAvailability keeps Anthropic curated ids when direct models are loaded', () => {
  const curated = [{ id: 'anthropic/claude-haiku-4.5' }, { id: 'moonshotai/kimi-k2.5' }];

  const filtered = filterCuratedModelsByAvailability(
    curated,
    new Set(['anthropic-direct/claude-haiku-4.5']),
  );

  assert.deepEqual(filtered, [{ id: 'anthropic/claude-haiku-4.5' }]);
});

test('filterCuratedModelsByAvailability hides unavailable OpenRouter curated ids', () => {
  const curated = [{ id: 'anthropic/claude-haiku-4.5' }, { id: 'moonshotai/kimi-k2.5' }];

  const filtered = filterCuratedModelsByAvailability(
    curated,
    new Set(['anthropic-direct/claude-haiku-4.5']),
  );

  assert.equal(
    filtered.some((model) => model.id === 'moonshotai/kimi-k2.5'),
    false,
  );
});
