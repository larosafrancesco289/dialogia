'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '@/lib/types';

export type MessageScrollingOptions = {
  messages: Message[];
  chatId?: string;
  isStreaming: boolean;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  isAssistantPlaceholder: (message?: Message, previous?: Message) => boolean;
  onScrollAway?: () => void;
};

export function useMessageScrolling(options: MessageScrollingOptions) {
  const {
    messages,
    chatId,
    isStreaming,
    isMobile,
    prefersReducedMotion,
    isAssistantPlaceholder,
    onScrollAway,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const lastScrollTsRef = useRef(0);
  const onScrollAwayRef = useRef(onScrollAway);
  const autoScrollEnabledRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const atBottomRef = useRef(true);
  const scrollToBottomRef = useRef<(behavior: ScrollBehavior) => void>(() => {});
  const lastMessageMetaRef = useRef<{
    id?: string;
    role?: Message['role'];
    placeholder: boolean;
    contentLen: number;
    reasoningLen: number;
  }>();
  const followThresholdPx = isMobile ? 120 : 180;
  const overflowThresholdPx = Math.max(48, followThresholdPx / 2);

  useEffect(() => {
    onScrollAwayRef.current = onScrollAway;
  }, [onScrollAway]);

  const syncScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { wasProgrammatic: false, scrolledAway: false };

    const distanceFromBottom = Math.max(el.scrollHeight - el.scrollTop - el.clientHeight, 0);
    const withinFollowRange = distanceFromBottom <= followThresholdPx;
    const hasOverflow = el.scrollHeight - el.clientHeight > overflowThresholdPx;
    const showJumpNow = hasOverflow && !withinFollowRange;
    const wasProgrammatic = programmaticScrollRef.current;
    let scrolledAway = false;

    if (wasProgrammatic) {
      if (withinFollowRange) {
        programmaticScrollRef.current = false;
      }
      autoScrollEnabledRef.current = true;
    } else if (!withinFollowRange) {
      if (autoScrollEnabledRef.current) {
        autoScrollEnabledRef.current = false;
        scrolledAway = true;
      }
    } else {
      autoScrollEnabledRef.current = true;
    }

    atBottomRef.current = withinFollowRange;
    setAtBottom((prev) => (prev === withinFollowRange ? prev : withinFollowRange));
    setShowJump((prev) => (prev === showJumpNow ? prev : showJumpNow));

    return { wasProgrammatic, scrolledAway };
  }, [followThresholdPx, overflowThresholdPx, setAtBottom, setShowJump]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      const el = containerRef.current;
      if (!el) return;

      programmaticScrollRef.current = true;
      autoScrollEnabledRef.current = true;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const element = containerRef.current;
          if (!element) {
            programmaticScrollRef.current = false;
            return;
          }

          // Be more aggressive: assume we hit bottom if programmatic
          const target = Math.max(element.scrollHeight - element.clientHeight, 0);

          try {
            element.scrollTo({ top: target, behavior });
          } catch {
            element.scrollTop = target;
          }

          // Give the smooth scroll time to start before syncing
          if (behavior === 'smooth') {
            setTimeout(() => {
              programmaticScrollRef.current = false;
              syncScrollState();
            }, 300);
          } else {
            requestAnimationFrame(() => {
              programmaticScrollRef.current = false;
              syncScrollState();
            });
          }
        });
      });
    },
    [syncScrollState],
  );

  // Keep ref in sync to avoid dependency in effects
  useEffect(() => {
    scrollToBottomRef.current = scrollToBottom;
  }, [scrollToBottom]);

  // Scroll to bottom when switching chats
  useEffect(() => {
    if (!chatId) return;
    // Reset scroll state and scroll to bottom when chat changes
    autoScrollEnabledRef.current = true;
    programmaticScrollRef.current = false;
    lastMessageMetaRef.current = undefined;
    // Use 'auto' (instant) scroll when switching chats for immediate positioning
    scrollToBottomRef.current('auto');
  }, [chatId]);

  // Force unlock autoscroll immediately on user interaction
  const onUserScroll = useCallback(() => {
    // Only break lock if it was active
    if (autoScrollEnabledRef.current) {
      autoScrollEnabledRef.current = false;
      if (onScrollAwayRef.current) onScrollAwayRef.current();
    }
  }, []);

  // Watch for content size changes (e.g. syntax highlighting loading, images loading)
  useEffect(() => {
    const contentEl = contentRef.current;
    const containerEl = containerRef.current;
    if (!contentEl || !containerEl || typeof ResizeObserver === 'undefined') return;

    let prevScrollHeight = containerEl.scrollHeight;

    const observer = new ResizeObserver(() => {
      const currentScrollHeight = containerEl.scrollHeight;
      const delta = currentScrollHeight - prevScrollHeight;

      // Calculate where we were relative to the bottom BEFORE the resize
      const oldDistanceFromBottom =
        prevScrollHeight - containerEl.scrollTop - containerEl.clientHeight;

      prevScrollHeight = currentScrollHeight;

      // Only adjust if we were effectively at the bottom (strict threshold)
      // This prevents snapping if the user is reading slightly up
      if (delta > 0 && oldDistanceFromBottom < 20) {
        containerEl.scrollTop += delta;
        syncScrollState();
      } else {
        // If we didn't auto-scroll, we should still update our state
        // because we might no longer be at the bottom
        syncScrollState();
      }
    });

    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [syncScrollState]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (event: WheelEvent) => {
      if (atBottomRef.current) {
        const scrollingUp = event.deltaY < 0;
        if (!scrollingUp) return;
      }
      onUserScroll();
    };

    const handleTouchStart = () => {
      if (atBottomRef.current) return;
      onUserScroll();
    };

    // Scroll event for checking if we're back at bottom
    const handleScroll = () => {
      // If programmatic, ignore
      if (programmaticScrollRef.current) {
        // Re-enable autoscroll once the animation settles if we're at bottom?
        // Actually syncScrollState handles re-enabling if at bottom.
        return;
      }

      // Check position
      const { wasProgrammatic } = syncScrollState();
      if (wasProgrammatic) return;
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('wheel', handleWheel, { passive: true });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });

    syncScrollState();

    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
    };
  }, [isMobile, syncScrollState, onUserScroll]);

  useEffect(() => {
    syncScrollState();
  }, [messages.length, syncScrollState]);

  const lastLen = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return 0;
    return (last.content?.length ?? 0) + (last.reasoning?.length ?? 0);
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      lastMessageMetaRef.current = undefined;
      autoScrollEnabledRef.current = true;
      programmaticScrollRef.current = false;
      atBottomRef.current = true;
      // Reset state only when it changes to avoid render loops on new-array renders.
      if (showJump || !atBottom) {
        setShowJump(false);
        setAtBottom(true);
      }
      return;
    }

    const last = messages[messages.length - 1];
    const secondToLast = messages[messages.length - 2];
    const placeholder = isAssistantPlaceholder(last, secondToLast);

    const meta = {
      id: last?.id,
      role: last?.role,
      placeholder,
      contentLen: last?.content?.length ?? 0,
      reasoningLen: last?.reasoning?.length ?? 0,
    };

    const prevMeta = lastMessageMetaRef.current;
    if (
      prevMeta &&
      prevMeta.id === meta.id &&
      prevMeta.role === meta.role &&
      prevMeta.placeholder === meta.placeholder &&
      prevMeta.contentLen === meta.contentLen &&
      prevMeta.reasoningLen === meta.reasoningLen
    ) {
      return;
    }

    lastMessageMetaRef.current = meta;
    const hasRecentUserMessage = meta.role === 'user' || meta.placeholder;
    if (hasRecentUserMessage) {
      autoScrollEnabledRef.current = true;
    }

    const shouldFollow =
      (atBottomRef.current && autoScrollEnabledRef.current) || hasRecentUserMessage;

    if (shouldFollow) {
      if (!programmaticScrollRef.current) {
        scrollToBottomRef.current(prefersReducedMotion ? 'auto' : 'smooth');
      }
    } else if (!atBottomRef.current) {
      setShowJump((prev) => (prev === true ? prev : true));
    }
  }, [messages, prefersReducedMotion, isAssistantPlaceholder, showJump, atBottom]);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    if (isStreaming && atBottomRef.current) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastScrollTsRef.current > 160) {
        scrollToBottomRef.current('auto');
        lastScrollTsRef.current = now;
      }
    }
    if (!isStreaming) lastScrollTsRef.current = 0;
  }, [isStreaming, lastLen]);

  const jumpToLatest = useCallback(() => {
    autoScrollEnabledRef.current = true;
    setShowJump(false); // Explicitly hide it immediately on click
    scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
  }, [prefersReducedMotion, scrollToBottom, setShowJump]);

  return {
    containerRef,
    contentRef,
    endRef,
    atBottom,
    showJump,
    setShowJump,
    scrollToBottom,
    jumpToLatest,
  };
}
