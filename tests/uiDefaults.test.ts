import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultUIState, resetEphemeralUi } from '@/lib/ui/defaults';
import type { UIState } from '@/lib/store/types';

test('buildDefaultUIState applies overrides without mutating defaults', () => {
  const base = buildDefaultUIState();
  const overridden = buildDefaultUIState({ debugMode: true, forceTutorMode: true });

  assert.equal(base.debugMode, false);
  assert.equal(overridden.debugMode, true);
  assert.equal(base.forceTutorMode, false);
  assert.equal(overridden.forceTutorMode, true);
});

test('resetEphemeralUi clears staged next values', () => {
  const state: UIState = {
    ...buildDefaultUIState(),
    nextModel: 'test-model',
    nextSearchEnabled: true,
    nextTutorMode: true,
    forceTutorMode: true,
  };

  const reset = resetEphemeralUi(state);
  assert.equal(reset.nextModel, undefined);
  assert.equal(reset.nextSearchEnabled, false);
  assert.equal(reset.nextTutorMode, false);
  assert.equal(reset.forceTutorMode, true);
  assert.equal(reset.next, undefined);
});
