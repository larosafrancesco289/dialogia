import { useCallback, useEffect, useRef, useState } from 'react';
import { HEADER } from '@/lib/mobile/gestureConfig';

export type CollapsingHeaderState = {
  /** Whether the header is currently hidden */
  isHidden: boolean;
  /** Current translateY offset (0 = visible, -HEADER_HEIGHT = hidden) */
  translateY: number;
  /** Current opacity (1 = visible, 0 = hidden) */
  opacity: number;
  /** Attach to the scroll container */
  onScroll: (e: React.UIEvent<HTMLElement>) => void;
  /** Force header to show (e.g., when keyboard opens) */
  forceShow: () => void;
  /** Force header to hide */
  forceHide: () => void;
};

/**
 * useCollapsingHeader - Controls header visibility based on scroll.
 *
 * Behavior:
 * - Hides when scrolling down past threshold
 * - Shows when scrolling up
 * - Quick velocity triggers instant hide/show
 * - Can be force-shown (e.g., when keyboard appears)
 */
export function useCollapsingHeader(opts?: {
  disabled?: boolean;
  headerHeight?: number;
}): CollapsingHeaderState {
  const { disabled = false, headerHeight = HEADER.HEIGHT } = opts || {};

  const [isHidden, setIsHidden] = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const [opacity, setOpacity] = useState(1);

  const lastScrollY = useRef(0);
  const lastTimestamp = useRef(0);
  const accumulatedDelta = useRef(0);
  const forcedVisible = useRef(false);

  const updateVisibility = useCallback(
    (hidden: boolean) => {
      setIsHidden(hidden);
      setTranslateY(hidden ? -headerHeight : 0);
      setOpacity(hidden ? 0 : 1);
    },
    [headerHeight],
  );

  const forceShow = useCallback(() => {
    forcedVisible.current = true;
    updateVisibility(false);
  }, [updateVisibility]);

  const forceHide = useCallback(() => {
    forcedVisible.current = false;
    updateVisibility(true);
  }, [updateVisibility]);

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      if (disabled || forcedVisible.current) return;

      const target = e.currentTarget;
      const scrollY = target.scrollTop;
      const now = performance.now();

      // Calculate velocity (px/ms)
      const deltaY = scrollY - lastScrollY.current;
      const deltaTime = now - lastTimestamp.current;
      const velocity = deltaTime > 0 ? deltaY / deltaTime : 0;

      // Quick velocity triggers instant hide/show
      if (velocity > HEADER.VELOCITY_THRESHOLD) {
        // Scrolling down quickly - hide immediately
        updateVisibility(true);
        accumulatedDelta.current = 0;
      } else if (velocity < -HEADER.VELOCITY_THRESHOLD) {
        // Scrolling up quickly - show immediately
        updateVisibility(false);
        accumulatedDelta.current = 0;
      } else {
        // Normal scrolling - accumulate delta
        accumulatedDelta.current += deltaY;

        if (accumulatedDelta.current > HEADER.COLLAPSE_THRESHOLD) {
          // Scrolled down enough - hide
          updateVisibility(true);
          accumulatedDelta.current = 0;
        } else if (accumulatedDelta.current < -HEADER.REVEAL_THRESHOLD) {
          // Scrolled up enough - show
          updateVisibility(false);
          accumulatedDelta.current = 0;
        }
      }

      // Always show header at top of scroll
      if (scrollY <= 0) {
        updateVisibility(false);
        accumulatedDelta.current = 0;
      }

      lastScrollY.current = scrollY;
      lastTimestamp.current = now;
    },
    [disabled, updateVisibility],
  );

  // Reset when disabled changes
  useEffect(() => {
    if (disabled) {
      updateVisibility(false);
      accumulatedDelta.current = 0;
      forcedVisible.current = false;
    }
  }, [disabled, updateVisibility]);

  return {
    isHidden,
    translateY,
    opacity,
    onScroll,
    forceShow,
    forceHide,
  };
}
