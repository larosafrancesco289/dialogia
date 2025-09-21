'use client';

import { useEffect, useState } from 'react';

/**
 * Provides the vertical inset introduced by on-screen keyboards on mobile browsers.
 * Uses VisualViewport when available and falls back to window innerHeight changes.
 */
export function useKeyboardInsets() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const viewport = window.visualViewport || null;
    let baseline = window.innerHeight;

    const updateOffset = (next: number) => {
      setOffset((prev) => {
        if (Math.abs(prev - next) < 1) return prev;
        return next;
      });
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--keyboard-offset', `${Math.round(next)}px`);
      }
    };

    const compute = () => {
      if (typeof window === 'undefined') return;
      const currentInner = window.innerHeight;

      if (viewport) {
        const viewportHeight = viewport.height ?? currentInner;
        const viewportOffsetTop = viewport.offsetTop ?? 0;
        const visibleHeight = viewportHeight + viewportOffsetTop;
        const occlusionLikely =
          viewportOffsetTop > 1 || Math.abs(currentInner - viewportHeight) > 1;

        if (!occlusionLikely) {
          baseline = visibleHeight;
        } else {
          baseline = Math.max(baseline, visibleHeight);
        }

        const occluded = Math.max(0, baseline - visibleHeight);
        updateOffset(occluded);
        if (occluded <= 1) baseline = visibleHeight;
      } else {
        const occlusionLikely = Math.abs(baseline - currentInner) > 1;
        if (!occlusionLikely) {
          baseline = currentInner;
        } else {
          baseline = Math.max(baseline, currentInner);
        }
        const occluded = Math.max(0, baseline - currentInner);
        updateOffset(occluded);
        if (occluded <= 1) baseline = currentInner;
      }
    };

    compute();

    if (viewport) {
      viewport.addEventListener('resize', compute);
      viewport.addEventListener('scroll', compute);
    } else {
      window.addEventListener('resize', compute);
    }

    return () => {
      if (viewport) {
        viewport.removeEventListener('resize', compute);
        viewport.removeEventListener('scroll', compute);
      } else {
        window.removeEventListener('resize', compute);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--keyboard-offset', '0px');
      }
    };
  }, []);

  return offset;
}
