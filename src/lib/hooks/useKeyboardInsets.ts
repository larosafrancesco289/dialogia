'use client';

import { useEffect, useState } from 'react';

export type KeyboardMetrics = {
  offset: number;
  viewportHeight: number;
  viewportTop: number;
};

const KEYBOARD_THRESHOLD = 60; // px difference to treat as a real keyboard occlusion

/**
 * Tracks the on-screen keyboard occlusion and visual viewport metrics.
 * Keeps CSS custom properties in sync so layout can respond via pure CSS.
 */
export function useKeyboardInsets(): KeyboardMetrics {
  const initialHeight =
    typeof window !== 'undefined' && typeof window.innerHeight === 'number'
      ? window.innerHeight
      : 0;
  const [metrics, setMetrics] = useState<KeyboardMetrics>({
    offset: 0,
    viewportHeight: initialHeight,
    viewportTop: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const viewport = window.visualViewport || null;
    let fallbackBaseline = window.innerHeight;
    let viewportBaseline = viewport
      ? Math.max(
          window.innerHeight,
          (viewport.height ?? window.innerHeight) + (viewport.offsetTop ?? 0),
        )
      : window.innerHeight;
    let viewportKeyboardVisible = false;
    let fallbackKeyboardVisible = false;
    let frameHandle = 0;
    const doc = typeof document !== 'undefined' ? document : null;
    const root = doc?.documentElement ?? null;

    const commitMetrics = (next: KeyboardMetrics) => {
      const roundedOffset = Math.max(0, Math.round(next.offset));
      const roundedHeight = Math.max(0, Math.round(next.viewportHeight));
      const roundedTop = Math.max(0, Math.round(next.viewportTop));

      setMetrics((prev) => {
        if (prev.offset === roundedOffset && prev.viewportHeight === roundedHeight && prev.viewportTop === roundedTop) {
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

    const computeMetrics = (): KeyboardMetrics => {
      if (viewport) {
        const top = viewport.offsetTop ?? 0;
        const height = viewport.height ?? window.innerHeight;
        const total = height + top;
        const candidate = Math.max(total, window.innerHeight);

        if (!viewportKeyboardVisible) {
          viewportBaseline = Math.max(viewportBaseline, candidate);
        } else if (candidate > viewportBaseline) {
          viewportBaseline = candidate;
        }

        let occlusion = Math.max(0, viewportBaseline - total);

        if (occlusion > KEYBOARD_THRESHOLD) {
          viewportKeyboardVisible = true;
        } else if (viewportKeyboardVisible) {
          viewportKeyboardVisible = false;
          viewportBaseline = candidate;
          occlusion = 0;
        } else {
          viewportBaseline = candidate;
          occlusion = 0;
        }

        return {
          offset: occlusion,
          viewportHeight: height,
          viewportTop: top,
        };
      }

      const currentInner = window.innerHeight;
      const diff = fallbackBaseline - currentInner;
      let occlusion = 0;
      if (!fallbackKeyboardVisible) {
        fallbackBaseline = Math.max(fallbackBaseline, currentInner);
      }

      if (diff > KEYBOARD_THRESHOLD) {
        fallbackKeyboardVisible = true;
        fallbackBaseline = Math.max(fallbackBaseline, currentInner);
        occlusion = Math.max(0, fallbackBaseline - currentInner);
      } else {
        if (fallbackKeyboardVisible) {
          fallbackKeyboardVisible = false;
          fallbackBaseline = currentInner;
        } else {
          fallbackBaseline = currentInner;
        }
        occlusion = 0;
      }

      return {
        offset: occlusion,
        viewportHeight: currentInner,
        viewportTop: 0,
      };
    };

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
