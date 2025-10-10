'use client';

import { useEffect, useState } from 'react';

export type KeyboardMetrics = {
  offset: number;
  viewportHeight: number;
  viewportTop: number;
};

const KEYBOARD_THRESHOLD = 60; // px difference to treat as a real keyboard occlusion

export type KeyboardTrackerState = {
  viewportBaseline: number;
  viewportKeyboardVisible: boolean;
  fallbackBaseline: number;
  fallbackKeyboardVisible: boolean;
};

export function createKeyboardTrackerState(
  win: Window,
  viewport: VisualViewport | null,
): KeyboardTrackerState {
  const baseline = win.innerHeight;
  const viewportHeight = viewport?.height ?? baseline;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBaseline = Math.max(baseline, viewportHeight + viewportTop);
  return {
    viewportBaseline,
    viewportKeyboardVisible: false,
    fallbackBaseline: baseline,
    fallbackKeyboardVisible: false,
  };
}

export function computeKeyboardMetrics(
  state: KeyboardTrackerState,
  env: { window: Window; viewport: VisualViewport | null },
): KeyboardMetrics {
  const { window: win, viewport } = env;

  if (viewport) {
    const top = viewport.offsetTop ?? 0;
    const height = viewport.height ?? win.innerHeight;
    const total = height + top;
    const candidate = Math.max(total, win.innerHeight);

    if (!state.viewportKeyboardVisible) {
      state.viewportBaseline = Math.max(state.viewportBaseline, candidate);
    } else if (candidate > state.viewportBaseline) {
      state.viewportBaseline = candidate;
    }

    let occlusion = Math.max(0, state.viewportBaseline - total);

    if (occlusion > KEYBOARD_THRESHOLD) {
      state.viewportKeyboardVisible = true;
    } else if (state.viewportKeyboardVisible) {
      state.viewportKeyboardVisible = false;
      state.viewportBaseline = candidate;
      occlusion = 0;
    } else {
      state.viewportBaseline = candidate;
      occlusion = 0;
    }

    return {
      offset: occlusion,
      viewportHeight: height,
      viewportTop: top,
    };
  }

  const currentInner = win.innerHeight;
  const diff = state.fallbackBaseline - currentInner;
  let occlusion = 0;

  if (!state.fallbackKeyboardVisible) {
    state.fallbackBaseline = Math.max(state.fallbackBaseline, currentInner);
  }

  if (diff > KEYBOARD_THRESHOLD) {
    state.fallbackKeyboardVisible = true;
    state.fallbackBaseline = Math.max(state.fallbackBaseline, currentInner);
    occlusion = Math.max(0, state.fallbackBaseline - currentInner);
  } else {
    if (state.fallbackKeyboardVisible) {
      state.fallbackKeyboardVisible = false;
      state.fallbackBaseline = currentInner;
    } else {
      state.fallbackBaseline = currentInner;
    }
    occlusion = 0;
  }

  return {
    offset: occlusion,
    viewportHeight: currentInner,
    viewportTop: 0,
  };
}

/**
 * Tracks the on-screen keyboard occlusion and visual viewport metrics.
 * Keeps CSS custom properties in sync so layout can respond via pure CSS.
 */
export function useKeyboardInsets(): KeyboardMetrics {
  // Start with a consistent zero height so SSR and first client paint match.
  const initialHeight = 0;
  const [metrics, setMetrics] = useState<KeyboardMetrics>({
    offset: 0,
    viewportHeight: initialHeight,
    viewportTop: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const viewport = window.visualViewport || null;
    const trackerState = createKeyboardTrackerState(window, viewport);
    let frameHandle = 0;
    const doc = typeof document !== 'undefined' ? document : null;
    const root = doc?.documentElement ?? null;

    const commitMetrics = (next: KeyboardMetrics) => {
      const roundedOffset = Math.max(0, Math.round(next.offset));
      const roundedHeight = Math.max(0, Math.round(next.viewportHeight));
      const roundedTop = Math.max(0, Math.round(next.viewportTop));

      setMetrics((prev) => {
        if (
          prev.offset === roundedOffset &&
          prev.viewportHeight === roundedHeight &&
          prev.viewportTop === roundedTop
        ) {
          return prev;
        }
        return {
          offset: roundedOffset,
          viewportHeight: roundedHeight,
          viewportTop: roundedTop,
        };
      });

      if (root) {
        root.style.setProperty('--keyboard-offset', `${roundedOffset}px`);
        root.style.setProperty('--viewport-height', `${roundedHeight}px`);
        root.style.setProperty('--viewport-offset-top', `${roundedTop}px`);
        root.style.setProperty('--viewport-offset-bottom', `${roundedOffset}px`);
        root.classList.toggle('keyboard-active', roundedOffset > 0);
      }
    };

    const computeMetrics = (): KeyboardMetrics =>
      computeKeyboardMetrics(trackerState, { window, viewport });

    const handleChange = () => {
      cancelAnimationFrame(frameHandle);
      frameHandle = requestAnimationFrame(() => {
        const nextMetrics = computeMetrics();
        commitMetrics(nextMetrics);
      });
    };

    handleChange();

    if (viewport) {
      viewport.addEventListener('resize', handleChange);
      viewport.addEventListener('scroll', handleChange);
    } else {
      window.addEventListener('resize', handleChange);
      window.addEventListener('orientationchange', handleChange);
    }

    return () => {
      cancelAnimationFrame(frameHandle);
      if (viewport) {
        viewport.removeEventListener('resize', handleChange);
        viewport.removeEventListener('scroll', handleChange);
      } else {
        window.removeEventListener('resize', handleChange);
        window.removeEventListener('orientationchange', handleChange);
      }
      if (root) {
        root.style.setProperty('--keyboard-offset', '0px');
        root.style.setProperty('--viewport-height', '100dvh');
        root.style.setProperty('--viewport-offset-top', '0px');
        root.style.setProperty('--viewport-offset-bottom', '0px');
        root.classList.remove('keyboard-active');
      }
    };
  }, []);

  return metrics;
}
