'use client';

import { type ReactNode, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useSwipeGesture } from '@/lib/hooks/useSwipeGesture';
import { useChatStore } from '@/lib/store';
import { SwipeActionPanel, type SwipeAction } from './SwipeActionPanel';
import { SWIPE } from '@/lib/mobile/gestureConfig';
import styles from './SwipeableMessage.module.css';

export interface SwipeableMessageProps {
  /** The message ID */
  messageId: string;
  /** Message role for contextual actions */
  role: 'user' | 'assistant' | 'system';
  /** The message content to wrap */
  children: ReactNode;
  /** Callback for copy action */
  onCopy?: () => void;
  /** Callback for edit action */
  onEdit?: () => void;
  /** Callback for branch action */
  onBranch?: () => void;
  /** Callback for delete action */
  onDelete?: () => void;
  /** Disable swipe (e.g., during streaming) */
  disabled?: boolean;
}

/**
 * SwipeableMessage - Wraps message content with swipe-to-reveal actions.
 *
 * Features:
 * - iOS Mail-style swipe gestures
 * - Auto-close when another message is swiped
 * - Spring physics for natural feel
 * - Contextual actions based on role
 */
export function SwipeableMessage({
  messageId,
  role,
  children,
  onCopy,
  onEdit,
  onBranch,
  onDelete,
  disabled = false,
}: SwipeableMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Track which message is currently revealed in store
  const { swipeRevealedMessageId, setUI } = useChatStore((s) => ({
    swipeRevealedMessageId: s.ui.mobile.swipeRevealedMessageId,
    setUI: s.setUI,
  }));

  // When this message starts swiping, close others
  const handleSwipeStart = useCallback(() => {
    setUI({ mobile: { swipeRevealedMessageId: messageId } });
  }, [messageId, setUI]);

  // When swipe ends
  const handleSwipeEnd = useCallback(() => {
    // Only clear if this was the revealed message
    if (swipeRevealedMessageId === messageId) {
      setUI({ mobile: { swipeRevealedMessageId: null } });
    }
  }, [messageId, swipeRevealedMessageId, setUI]);

  // Handle action selection
  const handleAction = useCallback(
    (action: SwipeAction) => {
      switch (action) {
        case 'copy':
          onCopy?.();
          break;
        case 'edit':
          onEdit?.();
          break;
        case 'branch':
          onBranch?.();
          break;
        case 'delete':
          onDelete?.();
          break;
      }
      // Close after action
      setUI({ mobile: { swipeRevealedMessageId: null } });
    },
    [onCopy, onEdit, onBranch, onDelete, setUI],
  );

  // Swipe gesture hook
  const { x, isSwiping, direction, isThresholdCrossed, handlers, reset } = useSwipeGesture({
    onSwipeStart: handleSwipeStart,
    onSwipeEnd: handleSwipeEnd,
    disabled: disabled || role === 'system',
    enableLeft: true,
    enableRight: role === 'user', // Only user messages can be edited/deleted
  });

  // Close this message when another is swiped
  useEffect(() => {
    if (swipeRevealedMessageId && swipeRevealedMessageId !== messageId) {
      reset();
    }
  }, [swipeRevealedMessageId, messageId, reset]);

  // Calculate reveal progress (0-1)
  const revealProgress = useTransform(x, (latest: number) => {
    const absValue = Math.abs(latest);
    return Math.min(absValue / SWIPE.REVEAL_THRESHOLD, 1);
  });

  // Get current reveal progress as number
  const revealProgressValue = useMotionValue(0);
  useEffect(() => {
    const unsubscribe = revealProgress.on('change', (v) => {
      revealProgressValue.set(v);
    });
    return unsubscribe;
  }, [revealProgress, revealProgressValue]);

  // Current reveal side based on swipe direction
  const revealSide = direction === 'right' ? 'left' : direction === 'left' ? 'right' : null;

  // Memoize action panel to avoid re-renders
  const leftPanel = useMemo(
    () => (
      <SwipeActionPanel
        side="left"
        role={role}
        revealProgress={direction === 'right' ? 1 : 0}
        isActive={direction === 'right' && isThresholdCrossed}
        onAction={handleAction}
      />
    ),
    [role, direction, isThresholdCrossed, handleAction],
  );

  const rightPanel = useMemo(
    () => (
      <SwipeActionPanel
        side="right"
        role={role}
        revealProgress={direction === 'left' ? 1 : 0}
        isActive={direction === 'left' && isThresholdCrossed}
        onAction={handleAction}
      />
    ),
    [role, direction, isThresholdCrossed, handleAction],
  );

  // System messages don't get swipe actions
  if (role === 'system') {
    return <div className={styles.wrapper}>{children}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={styles.wrapper}
      data-swiping={isSwiping}
      data-reveal-side={revealSide}
    >
      {/* Action panels (behind the message) */}
      {leftPanel}
      {rightPanel}

      {/* Message content (swipeable) */}
      <motion.div className={styles.content} style={{ x }} {...handlers}>
        {children}
      </motion.div>
    </div>
  );
}
