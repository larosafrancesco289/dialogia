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
  const atBottomRef = useRef(true);
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

          const target = Math.max(element.scrollHeight - element.clientHeight, 0);
          const distance = target - element.scrollTop;

          if (Math.abs(distance) <= 1) {
            programmaticScrollRef.current = false;
            syncScrollState();
            return;
          }

          try {
            element.scrollTo({ top: target, behavior });
          } catch {
            element.scrollTop = target;
          }

          requestAnimationFrame(() => {
            syncScrollState();
          });
        });
      });
    },
    [syncScrollState],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { wasProgrammatic, scrolledAway } = syncScrollState();
      if (wasProgrammatic || !isMobile || !scrolledAway) return;
      const onScrollAwayFn = onScrollAwayRef.current;
      if (onScrollAwayFn) onScrollAwayFn();
    };

    syncScrollState();
    el.addEventListener('scroll', handleScroll, { passive: true } as any);
    return () => el.removeEventListener('scroll', handleScroll as any);
  }, [isMobile, syncScrollState]);

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
      setShowJump((prev) => (prev === false ? prev : false));
      setAtBottom((prev) => (prev === true ? prev : true));
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
        scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
      }
    } else if (!atBottom) {
      setShowJump((prev) => (prev === true ? prev : true));
    }
  }, [messages, prefersReducedMotion, scrollToBottom, isAssistantPlaceholder]);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    if (isStreaming && atBottomRef.current) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastScrollTsRef.current > 160) {
        scrollToBottom('auto');
        lastScrollTsRef.current = now;
      }
    }
    if (!isStreaming) lastScrollTsRef.current = 0;
  }, [isStreaming, lastLen, scrollToBottom]);

  const jumpToLatest = useCallback(() => {
    autoScrollEnabledRef.current = true;
    setShowJump((prev) => (prev === false ? prev : false));
    scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
  }, [prefersReducedMotion, scrollToBottom, setShowJump]);

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
