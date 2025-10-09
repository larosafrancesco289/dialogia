'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '@/lib/types';

export type MessageScrollingOptions = {
  messages: Message[];
  isStreaming: boolean;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  isAssistantPlaceholder: (message?: Message, previous?: Message) => boolean;
  onScrollAway?: () => void;
};

export function useMessageScrolling(options: MessageScrollingOptions) {
  const {
    messages,
    isStreaming,
    isMobile,
    prefersReducedMotion,
    isAssistantPlaceholder,
    onScrollAway,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const lastScrollTsRef = useRef(0);
  const onScrollAwayRef = useRef(onScrollAway);
  const autoScrollEnabledRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const programmaticTimeoutRef = useRef<number | null>(null);

  const FOLLOW_THRESHOLD_PX = 24;

  useEffect(() => {
    onScrollAwayRef.current = onScrollAway;
  }, [onScrollAway]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const el = containerRef.current;
    if (!el) return;

    if (programmaticTimeoutRef.current !== null) {
      clearTimeout(programmaticTimeoutRef.current);
      programmaticTimeoutRef.current = null;
    }

    programmaticScrollRef.current = true;
    autoScrollEnabledRef.current = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element = containerRef.current;
        if (!element) {
          programmaticScrollRef.current = false;
          return;
        }
        const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
        if (distance <= 1) {
          programmaticScrollRef.current = false;
          return;
        }
        try {
          const target = Math.max(element.scrollHeight - element.clientHeight, 0);
          element.scrollTo({ top: target, behavior });
        } catch {
          element.scrollTop = Math.max(element.scrollHeight - element.clientHeight, 0);
        }
      });
    });

    if (typeof window !== 'undefined') {
      const duration = behavior === 'smooth' ? 500 : 0;
      programmaticTimeoutRef.current = window.setTimeout(() => {
        programmaticScrollRef.current = false;
        programmaticTimeoutRef.current = null;
      }, duration);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const syncScrollState = () => {
      const distanceFromBottom = Math.max(el.scrollHeight - el.scrollTop - el.clientHeight, 0);
      const withinFollowRange = distanceFromBottom <= FOLLOW_THRESHOLD_PX;
      const showJumpNow = !withinFollowRange;
      const wasProgrammatic = programmaticScrollRef.current;
      let scrolledAway = false;

      if (wasProgrammatic) {
        if (withinFollowRange) {
          programmaticScrollRef.current = false;
        }
        autoScrollEnabledRef.current = true;
      } else {
        if (withinFollowRange) {
          autoScrollEnabledRef.current = true;
        } else if (autoScrollEnabledRef.current) {
          autoScrollEnabledRef.current = false;
          scrolledAway = true;
        }
      }

      setAtBottom((prev) => (prev === withinFollowRange ? prev : withinFollowRange));
      setShowJump((prev) => (prev === showJumpNow ? prev : showJumpNow));

      return { wasProgrammatic, scrolledAway };
    };

    const handleScroll = () => {
      const { wasProgrammatic, scrolledAway } = syncScrollState();
      if (wasProgrammatic || !isMobile || !scrolledAway) return;
      const onScrollAwayFn = onScrollAwayRef.current;
      if (onScrollAwayFn) onScrollAwayFn();
    };

    syncScrollState();
    el.addEventListener('scroll', handleScroll, { passive: true } as any);
    return () => el.removeEventListener('scroll', handleScroll as any);
  }, [isMobile]);

  useEffect(() => {
    return () => {
      if (programmaticTimeoutRef.current !== null) {
        clearTimeout(programmaticTimeoutRef.current);
        programmaticTimeoutRef.current = null;
      }
    };
  }, []);

  const lastLen = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return 0;
    return (last.content?.length ?? 0) + (last.reasoning?.length ?? 0);
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    const secondToLast = messages[messages.length - 2];
    const lastRole = last?.role;
    const placeholder = isAssistantPlaceholder(last, secondToLast);
    const hasRecentUserMessage = lastRole === 'user' || placeholder;
    if (hasRecentUserMessage) {
      autoScrollEnabledRef.current = true;
    }

    const shouldFollow = (atBottom && autoScrollEnabledRef.current) || hasRecentUserMessage;

    if (shouldFollow) {
      if (!programmaticScrollRef.current) {
        scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
      }
    } else if (!atBottom) {
      setShowJump((prev) => (prev === true ? prev : true));
    }
  }, [
    messages.length,
    messages,
    atBottom,
    prefersReducedMotion,
    isAssistantPlaceholder,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    if (isStreaming && atBottom) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastScrollTsRef.current > 160) {
        scrollToBottom('auto');
        lastScrollTsRef.current = now;
      }
    }
    if (!isStreaming) lastScrollTsRef.current = 0;
  }, [isStreaming, atBottom, lastLen, scrollToBottom]);

  const jumpToLatest = useCallback(() => {
    autoScrollEnabledRef.current = true;
    scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
  }, [prefersReducedMotion, scrollToBottom]);

  return {
    containerRef,
    endRef,
    atBottom,
    showJump,
    setShowJump,
    scrollToBottom,
    jumpToLatest,
  };
}
