import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSidebarGestureController } from '@/lib/hooks/useSidebarGestures';

const createTarget = (matches: Record<string, boolean>) => ({
  closest(selector: string) {
    return matches[selector] ? {} : null;
  },
});

const createPointerEvent = (
  x: number,
  y: number,
  target = createTarget({}),
  pointerType: string = 'touch',
) => ({
  clientX: x,
  clientY: y,
  pointerType,
  target,
}) as unknown as PointerEvent;

test('sidebar opens from edge swipe when collapsed', () => {
  let collapsed = true;
  const events: boolean[] = [];
  const controller = createSidebarGestureController({
    getCollapsed: () => collapsed,
    setCollapsed: (value) => {
      collapsed = value;
      events.push(value);
    },
  });

  controller.onPointerDown(createPointerEvent(10, 100));
  controller.onPointerMove(createPointerEvent(90, 100));

  assert.deepEqual(events, [false]);
  assert.equal(collapsed, false);
});

test('sidebar closes on left swipe when expanded', () => {
  let collapsed = false;
  const events: boolean[] = [];
  const controller = createSidebarGestureController({
    getCollapsed: () => collapsed,
    setCollapsed: (value) => {
      collapsed = value;
      events.push(value);
    },
  });

  controller.onPointerDown(createPointerEvent(200, 120));
  controller.onPointerMove(createPointerEvent(80, 120));

  assert.deepEqual(events, [true]);
  assert.equal(collapsed, true);
});

test('gestures ignore swipe origins inside message rows', () => {
  let collapsed = true;
  const controller = createSidebarGestureController({
    getCollapsed: () => collapsed,
    setCollapsed: (value) => {
      collapsed = value;
    },
  });

  const target = createTarget({ '[data-row-press]': true });
  controller.onPointerDown(createPointerEvent(12, 80, target));
  controller.onPointerMove(createPointerEvent(150, 80, target));

  assert.equal(collapsed, true);
});
