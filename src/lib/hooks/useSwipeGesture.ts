'use client';

import { useRef, useCallback, useState } from 'react';
import { useSpring, type MotionValue } from 'framer-motion';
import { SWIPE } from '@/lib/mobile/gestureConfig';
import { useHaptics } from './useHaptics';

export type SwipeDirection = 'left' | 'right' | null;

export interface UseSwipeGestureOptions {
  /** Callback when swiped left past threshold */
  onSwipeLeft?: () => void;
  /** Callback when swiped right past threshold */
  onSwipeRight?: () => void;
  /** Callback when swipe starts */
  onSwipeStart?: () => void;
  /** Callback when swipe ends (regardless of outcome) */
  onSwipeEnd?: () => void;
  /** Distance in px to trigger action (default: 80) */
  threshold?: number;
  /** Velocity in px/ms for quick swipe (default: 0.5) */
  velocityThreshold?: number;
  /** Maximum swipe distance (default: 120) */
  maxDistance?: number;
  /** Enable left swipe (default: true) */
  enableLeft?: boolean;
  /** Enable right swipe (default: true) */
  enableRight?: boolean;
  /** Disable swipe entirely */
  disabled?: boolean;
}

export interface SwipeGestureState {
  /** Current X translation (spring-animated) */
  x: MotionValue<number>;
  /** Whether currently swiping */
  isSwiping: boolean;
  /** Current swipe direction */
  direction: SwipeDirection;
  /** Whether threshold is crossed */
  isThresholdCrossed: boolean;
  /** Pointer event handlers */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  /** Reset swipe to initial state */
  reset: () => void;
}

/**
 * useSwipeGesture - Horizontal swipe detection with spring physics.
 *
 * Features:
 * - Directional locking (prevents accidental swipes during scroll)
 * - Spring-based animation for smooth feel
 * - Haptic feedback at threshold crossing
 * - Velocity-based quick swipe detection
 * - Resistance when exceeding max distance
 */
export function useSwipeGesture(options: UseSwipeGestureOptions = {}): SwipeGestureState {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeStart,
    onSwipeEnd,
    threshold = SWIPE.REVEAL_THRESHOLD,
    velocityThreshold = SWIPE.VELOCITY_THRESHOLD,
    maxDistance = SWIPE.MAX_DISTANCE,
    enableLeft = true,
    enableRight = true,
    disabled = false,
  } = options;

  const { light, medium } = useHaptics();

  // Spring for smooth animation
  const x = useSpring(0, {
    stiffness: 400,
    damping: 30,
    mass: 1,
  });

  // State
  const [isSwiping, setIsSwiping] = useState(false);
  const [direction, setDirection] = useState<SwipeDirection>(null);
  const [isThresholdCrossed, setIsThresholdCrossed] = useState(false);

  // Refs for tracking gesture state
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const isDragging = useRef(false);
  const isDirectionLocked = useRef(false);
  const lockedDirection = useRef<'horizontal' | 'vertical' | null>(null);
  const lastX = useRef(0);
  const hadThresholdCrossed = useRef(false);
  const pointerId = useRef<number | null>(null);

  const reset = useCallback(() => {
    x.set(0);
    setIsSwiping(false);
    setDirection(null);
    setIsThresholdCrossed(false);
    isDragging.current = false;
    isDirectionLocked.current = false;
    lockedDirection.current = null;
    hadThresholdCrossed.current = false;
    pointerId.current = null;
  }, [x]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;

      // Only track single touch
      if (pointerId.current !== null) return;

      pointerId.current = e.pointerId;
      startX.current = e.clientX;
      startY.current = e.clientY;
      startTime.current = Date.now();
      lastX.current = e.clientX;
      isDragging.current = true;
      isDirectionLocked.current = false;
      lockedDirection.current = null;
      hadThresholdCrossed.current = false;

      // Capture pointer for tracking outside element
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !isDragging.current) return;
      if (e.pointerId !== pointerId.current) return;

      const deltaX = e.clientX - startX.current;
      const deltaY = e.clientY - startY.current;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Determine direction lock on first significant movement
      if (!isDirectionLocked.current) {
        const totalDelta = absDeltaX + absDeltaY;
        if (totalDelta > SWIPE.DIRECTIONAL_LOCK) {
          isDirectionLocked.current = true;

          // Lock to the dominant direction
          if (absDeltaX > absDeltaY * 1.2) {
            lockedDirection.current = 'horizontal';
            setIsSwiping(true);
            onSwipeStart?.();
          } else {
            lockedDirection.current = 'vertical';
            // Not a horizontal swipe, let scroll happen
            isDragging.current = false;
            return;
          }
        }
      }

      // Only process horizontal swipes
      if (lockedDirection.current !== 'horizontal') return;

      // Prevent scrolling while swiping horizontally
      e.preventDefault();

      // Determine swipe direction
      const newDirection: SwipeDirection = deltaX > 0 ? 'right' : 'left';

      // Check if direction is enabled
      if ((newDirection === 'left' && !enableLeft) || (newDirection === 'right' && !enableRight)) {
        return;
      }

      setDirection(newDirection);

      // Apply resistance when exceeding max distance
      let constrainedDelta = deltaX;
      if (absDeltaX > maxDistance) {
        const excess = absDeltaX - maxDistance;
        const resistedExcess = excess * SWIPE.RESISTANCE;
        constrainedDelta = (maxDistance + resistedExcess) * Math.sign(deltaX);
      }

      // Update spring value
      x.set(constrainedDelta);
      lastX.current = e.clientX;

      // Check threshold crossing for haptic feedback
      const crossedThreshold = absDeltaX >= threshold;
      if (crossedThreshold !== hadThresholdCrossed.current) {
        hadThresholdCrossed.current = crossedThreshold;
        setIsThresholdCrossed(crossedThreshold);
        if (crossedThreshold) {
          light();
        }
      }
    },
    [disabled, threshold, maxDistance, enableLeft, enableRight, x, light, onSwipeStart],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerId !== pointerId.current) return;

      const wasSwiping = lockedDirection.current === 'horizontal';
      const deltaX = e.clientX - startX.current;
      const absDeltaX = Math.abs(deltaX);
      const elapsed = Date.now() - startTime.current;
      const velocity = absDeltaX / elapsed;

      // Release pointer capture
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if already released
      }

      if (wasSwiping) {
        // Check if action should trigger
        const shouldTrigger = absDeltaX >= threshold || velocity >= velocityThreshold;

        if (shouldTrigger) {
          medium();

          if (deltaX < 0 && enableLeft) {
            onSwipeLeft?.();
          } else if (deltaX > 0 && enableRight) {
            onSwipeRight?.();
          }
        }

        // Animate back to start
        x.set(0);
        onSwipeEnd?.();
      }

      // Reset state
      setIsSwiping(false);
      setDirection(null);
      setIsThresholdCrossed(false);
      isDragging.current = false;
      isDirectionLocked.current = false;
      lockedDirection.current = null;
      hadThresholdCrossed.current = false;
      pointerId.current = null;
    },
    [
      threshold,
      velocityThreshold,
      enableLeft,
      enableRight,
      onSwipeLeft,
      onSwipeRight,
      onSwipeEnd,
      x,
      medium,
    ],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerId !== pointerId.current) return;

      // Animate back to start
      x.set(0);
      onSwipeEnd?.();

      // Reset state
      setIsSwiping(false);
      setDirection(null);
      setIsThresholdCrossed(false);
      isDragging.current = false;
      isDirectionLocked.current = false;
      lockedDirection.current = null;
      hadThresholdCrossed.current = false;
      pointerId.current = null;
    },
    [x, onSwipeEnd],
  );

  return {
    x,
    isSwiping,
    direction,
    isThresholdCrossed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    reset,
  };
}
