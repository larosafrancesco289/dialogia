import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileModelDefaults } from '@/lib/models/defaultResolutions';
import type { ModelDescriptor } from '@/lib/types';

const model = (id: string, name: string, created = 1): ModelDescriptor => ({
  id,
  name,
  context_length: 128000,
  pricing: undefined,
  raw: { created },
});

const LUNA_6 = model('openai/gpt-6-luna', 'GPT-6 Luna', 100);
const LUNA_7 = model('openai/gpt-7-luna', 'GPT-7 Luna', 200);
const OPUS = model('anthropic/claude-opus-5.5', 'Claude Opus 5.5', 100);

test('nothing loaded changes nothing', () => {
  assert.deepEqual(reconcileModelDefaults([], { '~openai/gpt-luna-latest': 'x' }), {
    notices: [],
  });
});

test('the first load records each family quietly', () => {
  const update = reconcileModelDefaults([LUNA_6, OPUS], {});
  assert.deepEqual(update.resolutions, {
    '~openai/gpt-luna-latest': 'openai/gpt-6-luna',
    '~anthropic/claude-opus-latest': 'anthropic/claude-opus-5.5',
  });
  assert.equal(update.fallbackModelId, undefined);
  assert.deepEqual(update.notices, []);
});

test('a family that moves to a new release says so, and an unmoved one saves nothing', () => {
  const previous = { '~openai/gpt-luna-latest': 'openai/gpt-6-luna' };
  const moved = reconcileModelDefaults([LUNA_6, LUNA_7], previous);
  assert.equal(moved.resolutions?.['~openai/gpt-luna-latest'], 'openai/gpt-7-luna');
  assert.equal(moved.notices.length, 1);
  assert.match(moved.notices[0], /^GPT Luna is now .*GPT-7 Luna/);

  const same = reconcileModelDefaults([LUNA_6], previous);
  assert.equal(same.resolutions, undefined);
  assert.deepEqual(same.notices, []);
});

test('a fallback for an unserved default is announced once', () => {
  const first = reconcileModelDefaults([OPUS], {});
  assert.equal(first.fallbackModelId, 'anthropic/claude-opus-5.5');
  assert.equal(first.notices.length, 1);
  assert.match(first.notices[0], /^GPT Luna is not offered by your providers/);
  assert.equal(first.resolutions?.['fallback:~openai/gpt-luna-latest'], OPUS.id);

  const again = reconcileModelDefaults([OPUS], first.resolutions ?? {});
  assert.equal(again.fallbackModelId, 'anthropic/claude-opus-5.5');
  assert.deepEqual(again.notices, []);
  assert.equal(again.resolutions, undefined);
});
