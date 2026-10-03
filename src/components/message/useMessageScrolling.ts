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
  /**
   * Follow a reply's end as it is written. Off, the person's message is set at
   * the top on send and the reply is written under it while the list stays still.
   */
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

/**
 * The blank room a just-sent turn needs below it so its first message can
 * stand at the top of the list, as the person's message does on send in
 * every chat app: the reply then grows into that room and the list stays
 * still. All positions are in the list's scroll coordinates.
 */
export function turnRoom(m: {
  /** Where the sent message starts. */
  anchorTop: number;
  paddingTop: number;
  clientHeight: number;
  /** The list's whole length without the room. */
  lengthWithoutRoom: number;
}): { room: number; target: number } {
  const target = Math.max(m.anchorTop - m.paddingTop, 0);
  const room = Math.max(0, Math.round(target + m.clientHeight - m.lengthWithoutRoom));
  return { room, target };
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
  // The room under a turn sent here, and the message it keeps at the top.
  const roomRef = useRef<HTMLDivElement>(null);
  const anchorIdRef = useRef<string | null>(null);
  const anchorElRef = useRef<HTMLElement | null>(null);
  // Held at the top until the person scrolls: anything above it changing
  // height (the last reply giving up its actions, a note arriving) is made
  // up in the same frame, so the message never moves.
  const pinnedTargetRef = useRef<number | null>(null);
  // The person asked for the latest (the jump button): follow it until they
  // scroll away, as a chat that follows would.
  const followRequestedRef = useRef(false);
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
        (!followAllowedRef.current || !(autoScrollRef.current || followRequestedRef.current));
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
    followRequestedRef.current = false;
    pinnedTargetRef.current = null;
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

  // Sizes the room under the turn sent here; returns where the list stands
  // with that turn's message at the top, or null when none is kept.
  const fitTurnRoom = useCallback((): number | null => {
    const el = containerRef.current;
    const content = contentRef.current;
    const room = roomRef.current;
    const id = anchorIdRef.current;
    if (!el || !content || !room) return null;
    let anchor = anchorElRef.current;
    if (id && (!anchor?.isConnected || anchor.dataset.mid !== id)) {
      anchor = el.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`);
      anchorElRef.current = anchor;
    }
    if (!id || !anchor) {
      room.style.height = '0px';
      return null;
    }
    // Where it sits in the layout: not the scroll position, which iOS reports
    // late while a glide or the keyboard moves, nor its entrance animation.
    let offset = 0;
    for (let node: HTMLElement | null = anchor; node && node !== content; ) {
      offset += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    const paddingTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
    const { room: height, target } = turnRoom({
      anchorTop: paddingTop + offset,
      paddingTop,
      clientHeight: el.clientHeight,
      lengthWithoutRoom: el.scrollHeight - room.offsetHeight,
    });
    if (room.style.height !== `${height}px`) room.style.height = `${height}px`;
    return target;
  }, []);

  const scrollToTop = useCallback(
    (top: number, behavior: ScrollBehavior = 'auto') => {
      const el = containerRef.current;
      if (!el) return;

      followAllowedRef.current = true;
      programmaticScrollRef.current = true;
      setShowJump(false);

      const target = Math.max(top, 0);
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

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const el = containerRef.current;
      if (el) scrollToTop(el.scrollHeight - el.clientHeight, behavior);
    },
    [scrollToTop],
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
      pinnedTargetRef.current = null;
      if (event.deltaY < 0 && hasOverflowRef.current) {
        programmaticScrollRef.current = false;
        lockFollow();
      }
    };

    // Any press in the list (a tap to edit, the scrollbar) is the person's.
    const handlePointerDown = () => {
      pinnedTargetRef.current = null;
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const startY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY == null || currentY == null) return;
      if (Math.abs(currentY - startY) > 6) pinnedTargetRef.current = null;
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

      // Moved by the person in any way (keys, find, focus): the message is let go.
      const pinned = pinnedTargetRef.current;
      if (pinned !== null && Math.abs(el.scrollTop - pinned) > 1) pinnedTargetRef.current = null;

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
    el.addEventListener('pointerdown', handlePointerDown, { passive: true });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });

    applySnapshot(readSnapshot());

    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, [applySnapshot, lockFollow, markUserScrolledAway, readSnapshot]);

  useEffect(() => {
    const contentEl = contentRef.current;
    const el = containerRef.current;
    if (!contentEl || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      // The reply growing takes the room it fills: the list's length, and so
      // the view, stay put.
      const target = fitTurnRoom();
      const pinned = pinnedTargetRef.current;
      if (el && target !== null && pinned !== null) {
        const gliding = programmaticScrollRef.current;
        if (Math.abs(target - pinned) > 1) {
          pinnedTargetRef.current = target;
          scrollToTop(target, gliding && !prefersReducedMotion ? 'smooth' : 'auto');
          return;
        }
        if (!gliding && Math.abs(el.scrollTop - target) > 1) {
          scrollToTop(target, 'auto');
          return;
        }
      }
      // The list itself grew shorter (a phone's keyboard rising, a window
      // resized): an end that was in view stays in view, so a question being
      // answered is not pushed under the composer.
      if (entries.some((entry) => entry.target === el) && atBottomRef.current) {
        scrollToBottom('auto');
        return;
      }
      const settling = settlingRef.current;
      if (settling) restartSettleTimer();
      const following = autoScrollPreference || followRequestedRef.current || settling;
      if (following && followAllowedRef.current) {
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
    fitTurnRoom,
    followToBottom,
    readSnapshot,
    prefersReducedMotion,
    restartSettleTimer,
    scrollToBottom,
    scrollToTop,
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
    // An opened chat is read from its end, with no room kept under it.
    anchorIdRef.current = null;
    pinnedTargetRef.current = null;
    followRequestedRef.current = false;
    fitTurnRoom();
    // A chat with nothing left to grow settles too. In a hidden tab the
    // first resize starts the countdown, once the tab is shown.
    if (document.visibilityState === 'visible') restartSettleTimer();
    scrollToBottom('auto');
  }, [chatId, fitTurnRoom, restartSettleTimer, scrollToBottom]);

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
      followRequestedRef.current = false;
      // A chat opened on an unanswered message (a failed reply) is read from
      // its end like any other: only a turn seen arriving here is set at the top.
      if (autoScrollPreference || !previous) {
        scrollToBottom('auto');
        return;
      }
      // The person's message goes to the top, with room under it for the reply.
      const sent = [...messages].reverse().find((message) => message.role === 'user');
      // A tutor's ledger line was not typed here: it can arrive while the
      // person reads further up (a Hub choice, a line queued behind a reply),
      // so it moves the view only for someone already at the end.
      if (sent?.ledger && !atBottomRef.current) {
        applySnapshot(readSnapshot());
        return;
      }
      anchorIdRef.current = sent?.id ?? null;
      const target = fitTurnRoom();
      pinnedTargetRef.current = target;
      // A hidden tab never runs a glide, which would stall halfway.
      const glide = !prefersReducedMotion && document.visibilityState === 'visible';
      if (target === null) scrollToBottom('auto');
      else scrollToTop(target, glide ? 'smooth' : 'auto');
      return;
    }

    if (autoScrollPreference && followAllowedRef.current) {
      followToBottom();
    } else {
      fitTurnRoom();
      applySnapshot(readSnapshot());
    }
  }, [
    applySnapshot,
    autoScrollPreference,
    fitTurnRoom,
    followToBottom,
    lastMessageMeta,
    messages,
    prefersReducedMotion,
    readSnapshot,
    scrollToBottom,
    scrollToTop,
  ]);

  const wasStreamingRef = useRef(isStreaming);
  useEffect(() => {
    // A finished reply lets its message go: what changes after is the person's.
    if (wasStreamingRef.current && !isStreaming) pinnedTargetRef.current = null;
    wasStreamingRef.current = isStreaming;
    // A reply is not the opened chat settling: one the chat does not follow stays unfollowed.
    if (isStreaming) settlingRef.current = false;
    if (!isStreaming || !followAllowedRef.current) return;
    if (autoScrollPreference || followRequestedRef.current) followToBottom();
  }, [autoScrollPreference, followToBottom, isStreaming]);

  const jumpToLatest = useCallback(() => {
    followAllowedRef.current = true;
    followRequestedRef.current = true;
    pinnedTargetRef.current = null;
    scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
  }, [prefersReducedMotion, scrollToBottom]);

  return {
    containerRef,
    contentRef,
    endRef,
    roomRef,
    atBottom,
    showJump,
    scrollToBottom,
    jumpToLatest,
  };
}
