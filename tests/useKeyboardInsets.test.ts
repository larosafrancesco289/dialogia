import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKeyboardTrackerState,
  computeKeyboardMetrics,
  type KeyboardTrackerState,
} from '@/lib/hooks/useKeyboardInsets';

const createWindow = (innerHeight: number) => ({ innerHeight });
const createViewport = (height: number, offsetTop = 0) => ({ height, offsetTop });

test('computeKeyboardMetrics detects occlusion with visual viewport', () => {
  const win = createWindow(800) as unknown as Window;
  const viewport = createViewport(560, 0) as unknown as VisualViewport;
  const state = createKeyboardTrackerState(win, viewport);

  const metrics = computeKeyboardMetrics(state, { window: win, viewport });

  assert.equal(metrics.offset, 240);
  assert.equal(metrics.viewportHeight, 560);
  assert.equal(state.viewportKeyboardVisible, true);
});

test('computeKeyboardMetrics resets when occlusion disappears', () => {
  const win = createWindow(800) as unknown as Window;
  const viewport = createViewport(560, 0) as unknown as VisualViewport;
  const state: KeyboardTrackerState = {
    viewportBaseline: 800,
    viewportKeyboardVisible: true,
    fallbackBaseline: 800,
    fallbackKeyboardVisible: false,
  };

  Reflect.set(viewport, 'height', 790);
  const metrics = computeKeyboardMetrics(state, { window: win, viewport });
  assert.equal(metrics.offset, 0);
  assert.equal(state.viewportKeyboardVisible, false);
});

test('computeKeyboardMetrics handles fallback mode without visual viewport', () => {
  const win = createWindow(700) as unknown as Window;
  const state = createKeyboardTrackerState(win, null);
  Reflect.set(win, 'innerHeight', 500);
  const metrics = computeKeyboardMetrics(state, { window: win, viewport: null });
  assert.equal(metrics.offset, 200);
  assert.equal(state.fallbackKeyboardVisible, true);

  Reflect.set(win, 'innerHeight', 700);
  const next = computeKeyboardMetrics(state, { window: win, viewport: null });
  assert.equal(next.offset, 0);
  assert.equal(state.fallbackKeyboardVisible, false);
});
