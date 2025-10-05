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

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      const el = containerRef.current;
      if (!el) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const element = containerRef.current;
          if (!element) return;
          const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
          if (distance <= 1) return;
          try {
            const target = Math.max(element.scrollHeight - element.clientHeight, 0);
            element.scrollTo({ top: target, behavior });
          } catch {
            element.scrollTop = Math.max(element.scrollHeight - element.clientHeight, 0);
          }
        });
      });
    },
    [containerRef],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = Math.max(el.scrollHeight - el.scrollTop - el.clientHeight, 0);
      const nearBottom = distanceFromBottom <= 100;
      setAtBottom((prev) => (prev === nearBottom ? prev : nearBottom));
      setShowJump((prev) => (prev === !nearBottom ? prev : !nearBottom));
      if (isMobile && onScrollAway) onScrollAway();
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => el.removeEventListener('scroll', onScroll as any);
  }, [isMobile, onScrollAway]);

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
    if (atBottom || hasRecentUserMessage) {
      scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
    } else {
      setShowJump(true);
    }
  }, [messages.length, atBottom, prefersReducedMotion, isAssistantPlaceholder, messages, scrollToBottom]);

  useEffect(() => {
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
