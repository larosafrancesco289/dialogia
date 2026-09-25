import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, useMotionValue, useReducedMotion, type MotionValue } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import { createDrawerGesture } from '@/lib/mobile/drawerGesture';
import { motionTransition } from '@/lib/ui/motion';

const drawerWidthFor = (viewportWidth: number) => Math.round(Math.min(viewportWidth * 0.86, 340));

// Things that pan sideways on their own keep their swipes: code blocks, wide
// tables and display math scroll, and fields move their caret.
const OWN_SWIPE = 'input, textarea, select, [contenteditable="true"], [data-no-drawer-swipe]';

function pansHorizontally(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el.matches(OWN_SWIPE)) return true;
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

// A sheet, menu or dialog over the page owns the touch; the drawer waits.
function screenIsBlocked(): boolean {
  return !!document.querySelector('[aria-modal="true"], [role="menu"], .model-picker--sheet');
}

export type MobileDrawer = {
  open: boolean;
  width: number;
  /** 0 (closed) to `width` (open), following the finger while dragging. */
  offset: MotionValue<number>;
  setOpen: (open: boolean) => void;
};

/**
 * The phone drawer's state: open or shut in the store, and a motion value
 * that follows the finger in between. A swipe right anywhere on the page
 * draws the chat list in; a swipe left or a tap on the page puts it away.
 */
export function useMobileDrawer(): MobileDrawer {
  const open = useChatStore((s) => s.ui.mobile.drawerOpen);
  const setUI = useChatStore((s) => s.setUI);
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(() => drawerWidthFor(window.innerWidth));
  const offset = useMotionValue(open ? width : 0);

  const openRef = useRef(open);
  openRef.current = open;
  const widthRef = useRef(width);
  widthRef.current = width;

  const setOpen = useCallback(
    (next: boolean) => {
      setUI({ mobile: { drawerOpen: next } });
    },
    [setUI],
  );

  // Settle wherever the store says, carrying the finger's speed into it.
  useEffect(() => {
    const target = open ? width : 0;
    if (offset.get() === target && !offset.isAnimating()) return;
    const controls = animate(
      offset,
      target,
      reducedMotion
        ? { duration: 0 }
        : { ...motionTransition.follow, velocity: offset.getVelocity() },
    );
    return () => controls.stop();
  }, [open, width, offset, reducedMotion]);

  useEffect(() => {
    const onResize = () => setWidth(drawerWidthFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let suppressClickUntil = 0;
    const gesture = createDrawerGesture({
      getWidth: () => widthRef.current,
      getOffset: () => offset.get(),
      isOpen: () => openRef.current,
      isBlocked: screenIsBlocked,
      pansHorizontally,
      onDragStart: () => {
        offset.stop();
        // The keyboard would sit over the drawer; put it away as the page moves.
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.matches('input, textarea')) active.blur();
      },
      onDrag: (next) => offset.set(next),
      onSettle: (next) => {
        if (next !== openRef.current) {
          setUI({ mobile: { drawerOpen: next } });
          return;
        }
        // Released short of switching: spring back to where it was.
        animate(
          offset,
          next ? widthRef.current : 0,
          reducedMotion
            ? { duration: 0 }
            : { ...motionTransition.follow, velocity: offset.getVelocity() },
        );
      },
    });

    const onDown = (e: PointerEvent) => gesture.down(e);
    const onMove = (e: PointerEvent) => {
      gesture.move(e);
    };
    const onUp = () => {
      if (gesture.up()) suppressClickUntil = performance.now() + 400;
    };
    const onCancel = () => gesture.cancel();
    // A drag that ends over a row or a button is not a tap on it.
    const onClick = (e: MouseEvent) => {
      if (performance.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        suppressClickUntil = 0;
      }
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('click', onClick, true);
    };
  }, [offset, setUI, reducedMotion]);

  return { open, width, offset, setOpen };
}
