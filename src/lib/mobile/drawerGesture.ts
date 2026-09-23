// Module: mobile/drawerGesture
// Responsibility: The phone drawer's drag, as plain logic. A horizontal swipe
// anywhere on the page draws the chat list in from the left, following the
// finger; a swipe back puts it away. Vertical moves are left to scrolling.

/** Travel before a touch commits to being a horizontal drag or a scroll. */
export const DRAWER_SLOP_PX = 10;
/** A release faster than this (px/ms) settles in its own direction. */
export const DRAWER_FLING_PX_PER_MS = 0.35;

type Sample = { x: number; t: number };

export type DrawerGestureOptions = {
  /** Drawer width in px: the offset runs from 0 (closed) to this (open). */
  getWidth: () => number;
  getOffset: () => number;
  isOpen: () => boolean;
  /** Something else owns the screen (a sheet or dialog); leave touches alone. */
  isBlocked?: () => boolean;
  /** Whether the touch began on something that pans sideways itself. */
  pansHorizontally?: (target: EventTarget | null) => boolean;
  onDragStart?: () => void;
  onDrag: (offset: number) => void;
  onSettle: (open: boolean) => void;
};

export type DrawerPointer = {
  clientX: number;
  clientY: number;
  timeStamp: number;
  pointerType: string;
  isPrimary?: boolean;
  target: EventTarget | null;
};

/** Where a released drawer comes to rest. */
export function settleDrawer(offset: number, width: number, velocity: number): boolean {
  if (velocity > DRAWER_FLING_PX_PER_MS) return true;
  if (velocity < -DRAWER_FLING_PX_PER_MS) return false;
  return offset > width / 2;
}

export function createDrawerGesture(opts: DrawerGestureOptions) {
  let phase: 'idle' | 'pending' | 'dragging' = 'idle';
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let samples: Sample[] = [];

  const reset = () => {
    phase = 'idle';
    samples = [];
  };

  const velocity = () => {
    if (samples.length < 2) return 0;
    const last = samples[samples.length - 1];
    // Measure over the last ~80ms so a slow drag that ends in a flick counts.
    const first = samples.find((s) => last.t - s.t <= 80) ?? samples[0];
    const dt = last.t - first.t;
    return dt > 0 ? (last.x - first.x) / dt : 0;
  };

  const down = (e: DrawerPointer) => {
    reset();
    if (e.pointerType === 'mouse' || e.isPrimary === false) return;
    if (opts.isBlocked?.()) return;
    if (!opts.isOpen() && opts.pansHorizontally?.(e.target)) return;
    phase = 'pending';
    startX = e.clientX;
    startY = e.clientY;
    startOffset = opts.getOffset();
    samples = [{ x: e.clientX, t: e.timeStamp }];
  };

  /** Returns true while the drawer owns the touch. */
  const move = (e: DrawerPointer): boolean => {
    if (phase === 'idle') return false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (phase === 'pending') {
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx < DRAWER_SLOP_PX && ady < DRAWER_SLOP_PX) return false;
      const open = opts.isOpen();
      const horizontal = adx > ady * 1.2;
      // Closed, only a swipe to the right opens it; open, only a swipe to the
      // left closes it. Anything else was a scroll or a tap.
      if (!horizontal || (open ? dx > 0 : dx < 0)) {
        reset();
        return false;
      }
      phase = 'dragging';
      // Start from where the finger is now, so the drawer doesn't jump by
      // the slop it took to recognise the drag.
      startX = e.clientX;
      opts.onDragStart?.();
    }
    samples.push({ x: e.clientX, t: e.timeStamp });
    if (samples.length > 12) samples.shift();
    const width = opts.getWidth();
    const next = Math.min(width, Math.max(0, startOffset + (e.clientX - startX)));
    opts.onDrag(next);
    return true;
  };

  /** Returns true when the touch was a drag, so the click after it is not a tap. */
  const up = (): boolean => {
    if (phase !== 'dragging') {
      reset();
      return false;
    }
    const open = settleDrawer(opts.getOffset(), opts.getWidth(), velocity());
    reset();
    opts.onSettle(open);
    return true;
  };

  const cancel = () => {
    if (phase === 'dragging') {
      opts.onSettle(opts.getOffset() > opts.getWidth() / 2);
    }
    reset();
  };

  return { down, move, up, cancel, isDragging: () => phase === 'dragging' };
}
