import assert from 'node:assert/strict';
import test from 'node:test';
import { getScrollSnapshot, turnRoom } from '@/components/message/useMessageScrolling';

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

test('a sent message gets the room to stand at the top, and the reply takes that room', () => {
  // The message starts 900px down a list 700px tall, padded 16px above.
  const base = { anchorTop: 900, paddingTop: 16, clientHeight: 700 };
  // Only the message so far: the list is 1070px long without the room.
  const sent = turnRoom({ ...base, lengthWithoutRoom: 1070 });
  assert.equal(sent.target, 884);
  // At its end the list then stands exactly with the message at the top.
  assert.equal(1070 + sent.room - 700, sent.target);
  // The reply grew by 300px: the room shrinks by as much, so the list's
  // length and the view stay put.
  assert.equal(turnRoom({ ...base, lengthWithoutRoom: 1370 }).room, sent.room - 300);
  // A reply longer than the screen needs no room.
  assert.equal(turnRoom({ ...base, lengthWithoutRoom: 2000 }).room, 0);
});
