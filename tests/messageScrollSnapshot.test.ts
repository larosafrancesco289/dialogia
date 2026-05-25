import assert from 'node:assert/strict';
import test from 'node:test';
import { getScrollSnapshot } from '@/components/message/useMessageScrolling';

test('getScrollSnapshot treats non-overflowing content as pinned to bottom', () => {
  const snapshot = getScrollSnapshot({
    scrollHeight: 500,
    scrollTop: 0,
    clientHeight: 500,
  });

  assert.equal(snapshot.hasOverflow, false);
  assert.equal(snapshot.atBottom, true);
  assert.equal(snapshot.showJump, false);
});

test('getScrollSnapshot allows a small bottom threshold', () => {
  const snapshot = getScrollSnapshot(
    {
      scrollHeight: 1000,
      scrollTop: 552,
      clientHeight: 400,
    },
    { bottomThresholdPx: 48 },
  );

  assert.equal(snapshot.distanceFromBottom, 48);
  assert.equal(snapshot.hasOverflow, true);
  assert.equal(snapshot.atBottom, true);
  assert.equal(snapshot.showJump, false);
});

test('getScrollSnapshot shows the jump affordance once the user is away from bottom', () => {
  const snapshot = getScrollSnapshot(
    {
      scrollHeight: 1000,
      scrollTop: 500,
      clientHeight: 400,
    },
    { bottomThresholdPx: 48 },
  );

  assert.equal(snapshot.distanceFromBottom, 100);
  assert.equal(snapshot.hasOverflow, true);
  assert.equal(snapshot.atBottom, false);
  assert.equal(snapshot.showJump, true);
});
