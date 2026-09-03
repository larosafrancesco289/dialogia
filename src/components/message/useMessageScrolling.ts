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
  const lastMessageMetaRef = useRef<LastMessageMeta>();
  const previousChatIdRef = useRef<string>();
  const followFrameRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const programmaticClearFrameRef = useRef<number | null>(null);
  const programmaticClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);

  const bottomThresholdPx = isMobile ? 56 : 40;

  useEffect(() => {
    onScrollAwayRef.current = onScrollAway;
  }, [onScrollAway]);

  useEffect(() => {
    return () => {
      if (followFrameRef.current !== null) {
        cancelAnimationFrame(followFrameRef.current);
      }
      if (programmaticClearFrameRef.current !== null) {
        cancelAnimationFrame(programmaticClearFrameRef.current);
      }
      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
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

    if (snapshot.atBottom) {
      followAllowedRef.current = true;
    }

    setAtBottom((prev) => (prev === snapshot.atBottom ? prev : snapshot.atBottom));
    setShowJump((prev) => {
      const next = snapshot.hasOverflow && !snapshot.atBottom && !followAllowedRef.current;
      return prev === next ? prev : next;
    });
  }, []);

  const lockFollow = useCallback(() => {
    if (!followAllowedRef.current) return;
    followAllowedRef.current = false;
    onScrollAwayRef.current?.();
  }, []);

  const markUserScrolledAway = useCallback(() => {
    lockFollow();

    const snapshot = readSnapshot();
    if (snapshot) {
      hasOverflowRef.current = snapshot.hasOverflow;
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

      const clearProgrammatic = () => {
        programmaticScrollRef.current = false;
        applySnapshot(readSnapshot());
      };

      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
        programmaticClearTimerRef.current = null;
      }
      if (programmaticClearFrameRef.current !== null) {
        cancelAnimationFrame(programmaticClearFrameRef.current);
        programmaticClearFrameRef.current = null;
      }

      if (behavior === 'smooth' && !prefersReducedMotion) {
        programmaticClearTimerRef.current = setTimeout(clearProgrammatic, 320);
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

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const snapshot = readSnapshot();
        if (snapshot) {
          applySnapshot({
            ...snapshot,
            atBottom: snapshot.atBottom || entry.isIntersecting,
            showJump: snapshot.showJump && !entry.isIntersecting,
          });
        }
      },
      {
        root: el,
        rootMargin: `0px 0px ${bottomThresholdPx}px 0px`,
        threshold: 0,
      },
    );

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

    const handleScroll = () => {
      const snapshot = readSnapshot();
      if (!snapshot) return;

      if (programmaticScrollRef.current) {
        applySnapshot(snapshot);
        return;
      }

      if (!snapshot.atBottom) {
        markUserScrolledAway();
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
    if (!contentEl || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (autoScrollPreference && followAllowedRef.current) {
        followToBottom();
      } else {
        applySnapshot(readSnapshot());
      }
    });

    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [applySnapshot, autoScrollPreference, followToBottom, readSnapshot]);

  useEffect(() => {
    if (!chatId) return;
    if (previousChatIdRef.current === chatId) return;
    previousChatIdRef.current = chatId;

    followAllowedRef.current = true;
    programmaticScrollRef.current = false;
    touchStartYRef.current = null;
    lastMessageMetaRef.current = undefined;
    scrollToBottom('auto');
  }, [chatId, scrollToBottom]);

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
