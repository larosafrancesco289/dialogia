import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultUIState, resetEphemeralUi } from '@/lib/ui/defaults';
import type { UIState } from '@/lib/store/types';

test('buildDefaultUIState applies overrides without mutating defaults', () => {
  const base = buildDefaultUIState();
  const overridden = buildDefaultUIState({
    debug: { mode: true },
    tutor: { forceMode: true },
  });

  assert.equal(base.debug.mode, false);
  assert.equal(overridden.debug.mode, true);
  assert.equal(base.tutor?.forceMode, false);
  assert.equal(overridden.tutor?.forceMode, true);
});

test('resetEphemeralUi clears staged next values', () => {
  const state: UIState = {
    ...buildDefaultUIState(),
    overrides: {
      modelId: 'test-model',
      search: { enabled: true },
      tutorMode: true,
    },
    tutor: { ...buildDefaultUIState().tutor, forceMode: true },
  };

  const reset = resetEphemeralUi(state);
  assert.equal(reset.overrides, undefined);
  assert.equal(reset.tutor?.forceMode, true);
});
