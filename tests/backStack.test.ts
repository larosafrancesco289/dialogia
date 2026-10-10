import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackStack } from '@/lib/mobile/backStack';

/**
 * A browser's history as far as the stack sees it: a back() aims at the entry
 * before the current one when it is called, and lands, with its popstate, a
 * moment later. A pushState meanwhile adds an entry the back() then skips.
 */
function fakeHistory() {
  let index = 0;
  const pending: (() => void)[] = [];
  const history = {
    state: null,
    pushState: () => {
      index += 1;
    },
    back: () => {
      const target = index - 1;
      pending.push(() => {
        index = target;
        stack.onPopState();
      });
    },
  };
  const deferred: (() => void)[] = [];
  const stack = createBackStack(history, (fn) => deferred.push(fn));
  return {
    stack,
    /** Entries up to the current one: 1 is the page as it was loaded. */
    length: () => index + 1,
    /** The user presses Back. */
    pressBack: () => {
      index -= 1;
      stack.onPopState();
    },
    /** Only the stack's deferred work, not the popstates it asked for. */
    runDeferred: () => deferred.splice(0).forEach((fn) => fn()),
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

test("an overlay that opens while the last one's Back is on its way waits for it", () => {
  const h = fakeHistory();
  const closed: string[] = [];
  // Settings from the phone's drawer: the drawer closes, its Back is sent,
  // and Settings opens before that Back has landed.
  const releaseDrawer = h.stack.push(() => closed.push('drawer'));
  releaseDrawer();
  h.runDeferred();
  const releaseSettings = h.stack.push(() => closed.push('settings'));
  h.flush();
  assert.equal(h.length(), 2);
  // Closing Settings by hand takes its entry back and stays in the app.
  releaseSettings();
  h.flush();
  assert.equal(h.length(), 1);
  assert.deepEqual(closed, []);
});

test('an overlay that opens and closes while a Back is on its way never stands an entry', () => {
  const h = fakeHistory();
  const releaseDrawer = h.stack.push(() => assert.fail('Back was not pressed'));
  releaseDrawer();
  h.runDeferred();
  const releaseSheet = h.stack.push(() => assert.fail('Back was not pressed'));
  releaseSheet();
  h.flush();
  assert.equal(h.length(), 1);
});
