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
  /** When false, disable streaming follow. User messages still scroll into view. */
  autoScrollPreference?: boolean;
};

export type ScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export type ScrollSnapshot = {
  atBottom: boolean;
  distanceFromBottom: number;
  hasOverflow: boolean;
  showJump: boolean;
};

export function getScrollSnapshot(
  metrics: ScrollMetrics,
  options: { bottomThresholdPx?: number; overflowThresholdPx?: number } = {},
): ScrollSnapshot {
  const bottomThresholdPx = options.bottomThresholdPx ?? 48;
  const overflowThresholdPx = options.overflowThresholdPx ?? 8;
  const maxScrollTop = Math.max(metrics.scrollHeight - metrics.clientHeight, 0);
  const distanceFromBottom = Math.max(maxScrollTop - Math.max(metrics.scrollTop, 0), 0);
  const hasOverflow = maxScrollTop > overflowThresholdPx;
  const atBottom = !hasOverflow || distanceFromBottom <= bottomThresholdPx;

  return {
    atBottom,
    distanceFromBottom,
    hasOverflow,
    showJump: hasOverflow && !atBottom,
  };
}

type LastMessageMeta = {
  id?: string;
  role?: Message['role'];
  placeholder: boolean;
  contentLen: number;
  reasoningLen: number;
};

function normalizeScrollBehavior(behavior: ScrollBehavior): ScrollBehavior {
  return behavior === 'instant' ? 'auto' : behavior;
}

// A freshly opened chat keeps to its end until its content has stopped growing
// for this long (lazy cards, fonts, maths), the person scrolls away, or a turn starts.
const OPEN_SETTLE_QUIET_MS = 800;

export function useMessageScrolling(options: MessageScrollingOptions) {
  const {
    messages,
    chatId,
    isStreaming,
    isMobile,
    prefersReducedMotion,
    isAssistantPlaceholder,
    onScrollAway,
    autoScrollPreference = true,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const onScrollAwayRef = useRef(onScrollAway);
  const followAllowedRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const hasOverflowRef = useRef(false);
  // Where the list last stood, read before its own height changes.
  const atBottomRef = useRef(true);
  const lastMessageMetaRef = useRef<LastMessageMeta>();
  const previousChatIdRef = useRef<string>();
  const followFrameRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const programmaticClearFrameRef = useRef<number | null>(null);
  const programmaticClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  // A chat that does not follow new content (the tutor's) still needs the
  // jump button when something lands below the fold.
  const autoScrollRef = useRef(autoScrollPreference);
  autoScrollRef.current = autoScrollPreference;
  // A freshly opened chat keeps to its end while its content settles, whatever
  // it follows. The quiet countdown restarts on every resize, and resizes are
  // only observed in a shown tab, so a chat opened in the background settles once shown.
  const settlingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bottomThresholdPx = isMobile ? 56 : 40;

  useEffect(() => {
    onScrollAwayRef.current = onScrollAway;
  }, [onScrollAway]);

  useEffect(() => {
    // Clear the refs as well as the frames: a remount (StrictMode, a fast
    // refresh) keeps the refs, and a stale frame id would make every later
    // follow bail out as if one were still pending.
    return () => {
      if (followFrameRef.current !== null) {
        cancelAnimationFrame(followFrameRef.current);
        followFrameRef.current = null;
      }
      if (programmaticClearFrameRef.current !== null) {
        cancelAnimationFrame(programmaticClearFrameRef.current);
        programmaticClearFrameRef.current = null;
      }
      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
        programmaticClearTimerRef.current = null;
      }
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, []);

  const readSnapshot = useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;
    return getScrollSnapshot(el, { bottomThresholdPx });
  }, [bottomThresholdPx]);

  const applySnapshot = useCallback((snapshot: ScrollSnapshot | null) => {
    if (!snapshot) return;

    hasOverflowRef.current = snapshot.hasOverflow;
    atBottomRef.current = snapshot.atBottom;

    if (snapshot.atBottom) {
      followAllowedRef.current = true;
    }

    setAtBottom((prev) => (prev === snapshot.atBottom ? prev : snapshot.atBottom));
    setShowJump((prev) => {
      // Not while the list is taking itself to the end (the button's own
      // click included): it would come back for the length of the glide.
      const next =
        snapshot.hasOverflow &&
        !snapshot.atBottom &&
        !programmaticScrollRef.current &&
        (!followAllowedRef.current || !autoScrollRef.current);
      return prev === next ? prev : next;
    });
  }, []);

  // The quiet countdown that ends a freshly opened chat's settling.
  const restartSettleTimer = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      settlingRef.current = false;
    }, OPEN_SETTLE_QUIET_MS);
  }, []);

  const lockFollow = useCallback(() => {
    settlingRef.current = false;
    if (!followAllowedRef.current) return;
    followAllowedRef.current = false;
    onScrollAwayRef.current?.();
  }, []);

  const markUserScrolledAway = useCallback(() => {
    lockFollow();

    const snapshot = readSnapshot();
    if (snapshot) {
      hasOverflowRef.current = snapshot.hasOverflow;
      atBottomRef.current = snapshot.atBottom;
      setAtBottom((prev) => (prev === snapshot.atBottom ? prev : snapshot.atBottom));
      setShowJump(snapshot.hasOverflow && !snapshot.atBottom);
    }
  }, [lockFollow, readSnapshot]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const el = containerRef.current;
      if (!el) return;

      followAllowedRef.current = true;
      programmaticScrollRef.current = true;
      setShowJump(false);

      const target = Math.max(el.scrollHeight - el.clientHeight, 0);
      try {
        el.scrollTo({ top: target, behavior: normalizeScrollBehavior(behavior) });
      } catch {
        el.scrollTop = target;
      }

      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
        programmaticClearTimerRef.current = null;
      }
      if (programmaticClearFrameRef.current !== null) {
        cancelAnimationFrame(programmaticClearFrameRef.current);
        programmaticClearFrameRef.current = null;
      }

      const clearProgrammatic = () => {
        el.removeEventListener('scroll', waitForStill);
        programmaticClearTimerRef.current = null;
        programmaticScrollRef.current = false;
        applySnapshot(readSnapshot());
      };
      // A glide lasts as long as its distance needs, so it is over once the
      // list has been still for a moment, not after a fixed guess.
      function waitForStill() {
        if (programmaticClearTimerRef.current) clearTimeout(programmaticClearTimerRef.current);
        programmaticClearTimerRef.current = setTimeout(clearProgrammatic, 150);
      }

      if (behavior === 'smooth' && !prefersReducedMotion) {
        el.addEventListener('scroll', waitForStill);
        waitForStill();
      } else {
        programmaticClearFrameRef.current = requestAnimationFrame(() => {
          programmaticClearFrameRef.current = null;
          clearProgrammatic();
        });
      }
    },
    [applySnapshot, prefersReducedMotion, readSnapshot],
  );

  const followToBottom = useCallback(() => {
    if (!followAllowedRef.current) return;
    if (followFrameRef.current !== null) return;

    followFrameRef.current = requestAnimationFrame(() => {
      followFrameRef.current = null;
      if (!followAllowedRef.current) return;
      scrollToBottom('auto');
    });
  }, [scrollToBottom]);

  useEffect(() => {
    const el = containerRef.current;
    const target = endRef.current;
    if (!el || !target || typeof IntersectionObserver === 'undefined') {
      applySnapshot(readSnapshot());
      return;
    }

    // Only a prompt to measure: the end marker shows well before the last
    // 40px (the list pads its foot for the composer), and two answers to
    // "at the bottom?" made the jump button blink on and off between them.
    const observer = new IntersectionObserver(() => applySnapshot(readSnapshot()), {
      root: el,
      rootMargin: `0px 0px ${bottomThresholdPx}px 0px`,
      threshold: 0,
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [applySnapshot, bottomThresholdPx, readSnapshot]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && hasOverflowRef.current) {
        programmaticScrollRef.current = false;
        lockFollow();
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const startY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY == null || currentY == null) return;
      if (currentY - startY > 6 && hasOverflowRef.current) {
        programmaticScrollRef.current = false;
        lockFollow();
      }
    };

    // Scroll anchoring also moves the list, downward, when maths or a code
    // block above settles mid-stream; only a move up is the person leaving.
    let lastScrollTop = el.scrollTop;

    const handleScroll = () => {
      const movedUp = el.scrollTop < lastScrollTop;
      lastScrollTop = el.scrollTop;
      const snapshot = readSnapshot();
      if (!snapshot) return;

      if (programmaticScrollRef.current) {
        applySnapshot(snapshot);
        return;
      }

      if (!snapshot.atBottom) {
        if (movedUp) markUserScrolledAway();
        else applySnapshot(snapshot);
        return;
      }

      followAllowedRef.current = true;
      applySnapshot(snapshot);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('wheel', handleWheel, { passive: true });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });

    applySnapshot(readSnapshot());

    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, [applySnapshot, lockFollow, markUserScrolledAway, readSnapshot]);

  useEffect(() => {
    const contentEl = contentRef.current;
    const el = containerRef.current;
    if (!contentEl || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      // The list itself grew shorter (a phone's keyboard rising, a window
      // resized): an end that was in view stays in view, so a question being
      // answered is not pushed under the composer.
      if (entries.some((entry) => entry.target === el) && atBottomRef.current) {
        scrollToBottom('auto');
        return;
      }
      const settling = settlingRef.current;
      if (settling) restartSettleTimer();
      if ((autoScrollPreference || settling) && followAllowedRef.current) {
        followToBottom();
      } else {
        applySnapshot(readSnapshot());
      }
    });

    observer.observe(contentEl);
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [
    applySnapshot,
    autoScrollPreference,
    containerRef,
    followToBottom,
    readSnapshot,
    restartSettleTimer,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!chatId) return;
    if (previousChatIdRef.current === chatId) return;
    previousChatIdRef.current = chatId;

    followAllowedRef.current = true;
    programmaticScrollRef.current = false;
    touchStartYRef.current = null;
    lastMessageMetaRef.current = undefined;
    settlingRef.current = true;
    // A chat with nothing left to grow settles too. In a hidden tab the
    // first resize starts the countdown, once the tab is shown.
    if (document.visibilityState === 'visible') restartSettleTimer();
    scrollToBottom('auto');
  }, [chatId, restartSettleTimer, scrollToBottom]);

  const lastMessageMeta = useMemo<LastMessageMeta | null>(() => {
    const last = messages[messages.length - 1];
    if (!last) return null;
    const previous = messages[messages.length - 2];

    return {
      id: last.id,
      role: last.role,
      placeholder: isAssistantPlaceholder(last, previous),
      contentLen: last.content?.length ?? 0,
      reasoningLen: last.reasoning?.length ?? 0,
    };
  }, [isAssistantPlaceholder, messages]);

  useEffect(() => {
    if (!lastMessageMeta) {
      lastMessageMetaRef.current = undefined;
      followAllowedRef.current = true;
      programmaticScrollRef.current = false;
      hasOverflowRef.current = false;
      setAtBottom(true);
      setShowJump(false);
      return;
    }

    const previous = lastMessageMetaRef.current;
    if (
      previous &&
      previous.id === lastMessageMeta.id &&
      previous.role === lastMessageMeta.role &&
      previous.placeholder === lastMessageMeta.placeholder &&
      previous.contentLen === lastMessageMeta.contentLen &&
      previous.reasoningLen === lastMessageMeta.reasoningLen
    ) {
      return;
    }

    lastMessageMetaRef.current = lastMessageMeta;

    const isUserTurn = lastMessageMeta.role === 'user' || lastMessageMeta.placeholder;
    if (isUserTurn) {
      scrollToBottom('auto');
      return;
    }

    if (autoScrollPreference && followAllowedRef.current) {
      followToBottom();
    } else {
      applySnapshot(readSnapshot());
    }
  }, [
    applySnapshot,
    autoScrollPreference,
    followToBottom,
    lastMessageMeta,
    readSnapshot,
    scrollToBottom,
  ]);

  useEffect(() => {
    // A reply is not the opened chat settling: one the chat does not follow stays unfollowed.
    if (isStreaming) settlingRef.current = false;
    if (!isStreaming || !autoScrollPreference || !followAllowedRef.current) return;
    followToBottom();
  }, [autoScrollPreference, followToBottom, isStreaming]);

  const jumpToLatest = useCallback(() => {
    followAllowedRef.current = true;
    scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
  }, [prefersReducedMotion, scrollToBottom]);

  return {
    containerRef,
    contentRef,
    endRef,
    atBottom,
    showJump,
    scrollToBottom,
    jumpToLatest,
  };
}
