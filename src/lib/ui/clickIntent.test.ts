import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleClickDeferral } from './clickIntent';

function fakeTimers() {
  const queue = new Map<number, () => void>();
  let next = 1;
  return {
    timers: {
      set: (run: () => void) => {
        queue.set(next, run);
        return next++;
      },
      clear: (handle: unknown) => {
        queue.delete(handle as number);
      },
    },
    flush: () => {
      for (const [id, run] of [...queue]) {
        queue.delete(id);
        run();
      }
    },
  };
}

test('a single click runs once the double-click window has passed', () => {
  const { timers, flush } = fakeTimers();
  let toggles = 0;
  const clicks = createSingleClickDeferral(() => toggles++, { timers });
  clicks.click(1);
  assert.equal(toggles, 0);
  flush();
  assert.equal(toggles, 1);
});

test('a double click never runs the single click, so the folder does not flicker', () => {
  const { timers, flush } = fakeTimers();
  let toggles = 0;
  const clicks = createSingleClickDeferral(() => toggles++, { timers });
  clicks.click(1);
  clicks.click(2);
  clicks.cancel(); // the dblclick handler
  flush();
  assert.equal(toggles, 0);
});

test('a scripted click with no pointer runs at once', () => {
  const { timers } = fakeTimers();
  let toggles = 0;
  createSingleClickDeferral(() => toggles++, { timers }).click(0);
  assert.equal(toggles, 1);
});
