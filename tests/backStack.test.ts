import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackStack } from '@/lib/mobile/backStack';

function fakeHistory() {
  let length = 1;
  const pending: (() => void)[] = [];
  const history = {
    state: null,
    pushState: () => {
      length += 1;
    },
    back: () => {
      length -= 1;
      // The browser answers a back() with a popstate a moment later.
      pending.push(() => stack.onPopState());
    },
  };
  const deferred: (() => void)[] = [];
  const stack = createBackStack(history, (fn) => deferred.push(fn));
  return {
    stack,
    length: () => length,
    /** The user presses Back. */
    pressBack: () => {
      length -= 1;
      stack.onPopState();
    },
    /** Let deferred work and queued popstates run. */
    flush: () => {
      while (deferred.length || pending.length) {
        deferred.splice(0).forEach((fn) => fn());
        pending.splice(0).forEach((fn) => fn());
      }
    },
  };
}

test('Back closes the open drawer and leaves the page where it was', () => {
  const h = fakeHistory();
  let open = true;
  const release = h.stack.push(() => {
    open = false;
  });
  assert.equal(h.length(), 2);
  h.pressBack();
  assert.equal(open, false);
  release();
  h.flush();
  assert.equal(h.length(), 1);
});

test('closing by hand takes the extra entry back', () => {
  const h = fakeHistory();
  const release = h.stack.push(() => assert.fail('Back was not pressed'));
  release();
  h.flush();
  assert.equal(h.length(), 1);
  assert.equal(h.stack.size(), 0);
});

test('Back closes only the top of stacked overlays, then the next', () => {
  const h = fakeHistory();
  const closed: string[] = [];
  h.stack.push(() => closed.push('drawer'));
  h.stack.push(() => closed.push('sheet'));
  // One entry stands in for both.
  assert.equal(h.length(), 2);
  h.pressBack();
  assert.deepEqual(closed, ['sheet']);
  assert.equal(h.length(), 2);
  h.pressBack();
  assert.deepEqual(closed, ['sheet', 'drawer']);
  assert.equal(h.length(), 1);
});

test('a sheet that closes as the next opens keeps the one entry', () => {
  const h = fakeHistory();
  const closed: string[] = [];
  const releaseActions = h.stack.push(() => closed.push('actions'));
  // "Move to folder": the actions sheet closes and the move sheet opens in
  // the same tick.
  releaseActions();
  h.stack.push(() => closed.push('move'));
  h.flush();
  assert.equal(h.length(), 2);
  h.pressBack();
  assert.deepEqual(closed, ['move']);
  assert.equal(h.length(), 1);
});
