import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDrawerGesture, settleDrawer, type DrawerPointer } from '@/lib/mobile/drawerGesture';

const WIDTH = 300;

function setup(initialOpen = false, extra: { pans?: boolean; blocked?: boolean } = {}) {
  let offset = initialOpen ? WIDTH : 0;
  let open = initialOpen;
  const settled: boolean[] = [];
  const gesture = createDrawerGesture({
    getWidth: () => WIDTH,
    getOffset: () => offset,
    isOpen: () => open,
    isBlocked: () => !!extra.blocked,
    pansHorizontally: () => !!extra.pans,
    onDrag: (next) => {
      offset = next;
    },
    onSettle: (next) => {
      open = next;
      offset = next ? WIDTH : 0;
      settled.push(next);
    },
  });
  return { gesture, settled, offset: () => offset };
}

const at = (x: number, y: number, t: number, pointerType = 'touch'): DrawerPointer => ({
  clientX: x,
  clientY: y,
  timeStamp: t,
  pointerType,
  target: null,
});

test('a slow swipe right past halfway opens the drawer, following the finger', () => {
  const { gesture, settled, offset } = setup();
  gesture.down(at(100, 400, 0));
  assert.equal(gesture.move(at(115, 402, 20)), true);
  gesture.move(at(200, 404, 400));
  // The drawer tracks the finger from where the drag was recognised.
  assert.equal(offset(), 85);
  gesture.move(at(280, 404, 900));
  assert.equal(offset(), 165);
  assert.equal(gesture.up(), true);
  assert.deepEqual(settled, [true]);
});

test('a short swipe right that stops before halfway falls back closed', () => {
  const { gesture, settled } = setup();
  gesture.down(at(100, 400, 0));
  gesture.move(at(115, 400, 50));
  gesture.move(at(160, 400, 600));
  gesture.move(at(160, 400, 800));
  gesture.up();
  assert.deepEqual(settled, [false]);
});

test('a quick flick opens the drawer even when it travelled only a little', () => {
  const { gesture, settled } = setup();
  gesture.down(at(100, 400, 0));
  gesture.move(at(115, 400, 10));
  gesture.move(at(150, 400, 40));
  gesture.up();
  assert.deepEqual(settled, [true]);
});

test('a vertical move is a scroll and never moves the drawer', () => {
  const { gesture, settled, offset } = setup();
  gesture.down(at(100, 400, 0));
  assert.equal(gesture.move(at(104, 440, 30)), false);
  assert.equal(gesture.move(at(200, 450, 60)), false);
  assert.equal(gesture.up(), false);
  assert.equal(offset(), 0);
  assert.deepEqual(settled, []);
});

test('closed, a swipe left does nothing; open, a swipe left closes it', () => {
  const closed = setup();
  closed.gesture.down(at(200, 400, 0));
  assert.equal(closed.gesture.move(at(170, 400, 30)), false);

  const open = setup(true);
  open.gesture.down(at(250, 400, 0));
  open.gesture.move(at(235, 400, 20));
  open.gesture.move(at(60, 400, 300));
  assert.equal(open.offset(), 125);
  open.gesture.up();
  assert.deepEqual(open.settled, [false]);
});

test('mouse input, a blocked screen and sideways scrollers are left alone', () => {
  const mouse = setup();
  mouse.gesture.down(at(100, 400, 0, 'mouse'));
  assert.equal(mouse.gesture.move(at(250, 400, 50, 'mouse')), false);

  const blocked = setup(false, { blocked: true });
  blocked.gesture.down(at(100, 400, 0));
  assert.equal(blocked.gesture.move(at(250, 400, 50)), false);

  const code = setup(false, { pans: true });
  code.gesture.down(at(100, 400, 0));
  assert.equal(code.gesture.move(at(250, 400, 50)), false);
});

test('a cancelled drag settles by position', () => {
  const { gesture, settled } = setup();
  gesture.down(at(100, 400, 0));
  gesture.move(at(115, 400, 20));
  gesture.move(at(290, 400, 700));
  gesture.cancel();
  assert.deepEqual(settled, [true]);
});

test('settleDrawer: fling beats position, position decides otherwise', () => {
  assert.equal(settleDrawer(20, WIDTH, 1), true);
  assert.equal(settleDrawer(280, WIDTH, -1), false);
  assert.equal(settleDrawer(160, WIDTH, 0), true);
  assert.equal(settleDrawer(140, WIDTH, 0), false);
});
