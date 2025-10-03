'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/lib/store';
import {
  ChevronDownIcon,
  PencilSquareIcon,
  XMarkIcon,
  ClipboardIcon,
  ArrowPathIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import type { Attachment } from '@/lib/types';
import ImageLightbox from '@/components/ImageLightbox';
import MessagePanels, { type MessagePanelsProps } from '@/components/message/MessagePanels';
import MessageCard from '@/components/message/MessageCard';
export default function MessageList({ chatId }: { chatId: string }) {
  const messages = useChatStore((s) => s.messages[chatId] ?? []);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const models = useChatStore((s) => s.models);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const braveByMessageId = useChatStore((s) => s.ui.braveByMessageId || {});
  const braveGloballyEnabled = useChatStore((s) => !!s.ui.experimentalBrave);
  const tutorByMessageId = useChatStore((s) => s.ui.tutorByMessageId || {});
  const tutorGloballyEnabled = useChatStore((s) => !!s.ui.experimentalTutor);
  const forceTutorMode = useChatStore((s) => !!s.ui.forceTutorMode);
  const tutorMemoryDebugByMessageId = useChatStore((s) => s.ui.tutorMemoryDebugByMessageId || {});
  const updateChatSettings = useChatStore((s) => s.updateChatSettings);
  const regenerate = useChatStore((s) => s.regenerateAssistantMessage);
  const branchFrom = useChatStore((s) => s.branchChatFromMessage);
  const autoReasoningModelIds = useChatStore((s) => s.ui.autoReasoningModelIds || {});
  const showStats = chat?.settings.show_stats ?? false;
  const debugMode = useChatStore((s) => s.ui.debugMode || false);
  const debugByMessageId = useChatStore((s) => s.ui.debugByMessageId || {});
  const tutorMemoryAutoUpdateDefault = useChatStore((s) => s.ui.tutorMemoryAutoUpdate !== false);
  const tutorEnabled = tutorGloballyEnabled && (forceTutorMode || !!chat?.settings?.tutor_mode);
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, []);

  const [lightbox, setLightbox] = useState<{
    images: { src: string; name?: string }[];
    index: number;
  } | null>(null);
  const WINDOW_INCREMENT = 150;
  const [visibleCount, setVisibleCount] = useState(WINDOW_INCREMENT);
  // Tap-to-highlight state for mobile actions
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  // Mobile contextual action sheet (bottom)
  const [mobileSheet, setMobileSheet] = useState<{ id: string; role: 'assistant' | 'user' } | null>(
    null,
  );
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    update();
    window.addEventListener('resize', update, { passive: true } as any);
    return () => window.removeEventListener('resize', update as any);
  }, []);

  // Composer is now rendered outside this scroll container in ChatPane.

  // Track whether user is near the bottom to enable smart autoscroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = Math.max(el.scrollHeight - el.scrollTop - el.clientHeight, 0);
      const threshold = 100; // px
      const nearBottom = distanceFromBottom <= threshold;
      setAtBottom((prev) => (prev === nearBottom ? prev : nearBottom));
      // Show the jump button whenever the user is away from the bottom
      const shouldShowJump = !nearBottom;
      setShowJump((prev) => (prev === shouldShowJump ? prev : shouldShowJump));
      // Clear active message highlight on mobile when scrolling
      if (isMobile) {
        setActiveMessageId((current) => (current ? null : current));
      }
    };
    // Initialize state in case content already overflows
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => {
      el.removeEventListener('scroll', onScroll as any);
    };
  }, [isMobile]);

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= 1) return; // already at bottom; avoid redundant scrolls
    // Schedule after layout to avoid fighting with Resize/Mutation updates
    requestAnimationFrame(() => {
      try {
        const target = Math.max(el.scrollHeight - el.clientHeight, 0);
        el.scrollTo({ top: target, behavior });
      } catch {
        // Fallback for older browsers
        el.scrollTop = Math.max(el.scrollHeight - el.clientHeight, 0);
      }
    });
  };

  // Scroll when a new message is added, but only if at bottom or if user sent the last message
  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastRole = last?.role;
    if (messages.length === 0) return;
    if (atBottom || lastRole === 'user') {
      scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
    } else {
      setShowJump(true);
    }
  }, [messages.length]);
  // Also keep scrolling during streaming as content grows
  const lastLen =
    (messages[messages.length - 1]?.content?.length ?? 0) +
    (messages[messages.length - 1]?.reasoning?.length ?? 0);
  const lastScrollTsRef = useRef(0);
  useEffect(() => {
    if (isStreaming && atBottom) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastScrollTsRef.current > 160) {
        // During streaming, avoid smooth animation to reduce jitter
        scrollToBottom('auto');
        lastScrollTsRef.current = now;
      }
    }
    if (!isStreaming) lastScrollTsRef.current = 0;
  }, [lastLen, isStreaming, atBottom]);
  const showByDefault = chat?.settings.show_thinking_by_default ?? false;
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpandedReasoningIds((s) => ({ ...s, [id]: !s[id] }));
  const isExpanded = (id: string) => expandedReasoningIds[id] ?? showByDefault;
  const [expandedSourcesIds, setExpandedSourcesIds] = useState<Record<string, boolean>>({});
  const toggleSources = (id: string) => setExpandedSourcesIds((s) => ({ ...s, [id]: !s[id] }));
  const isSourcesExpanded = (id: string) => expandedSourcesIds[id] ?? true;
  const [expandedDebugIds, setExpandedDebugIds] = useState<Record<string, boolean>>({});
  const toggleDebug = (id: string) => setExpandedDebugIds((s) => ({ ...s, [id]: !s[id] }));
  const isDebugExpanded = (id: string) => expandedDebugIds[id] ?? false;
  const editUserMessage = useChatStore((s) => s.editUserMessage);
  const editAssistantMessage = useChatStore((s) => s.editAssistantMessage);
  const [expandedStatsIds, setExpandedStatsIds] = useState<Record<string, boolean>>({});
  const toggleStats = (id: string) => setExpandedStatsIds((s) => ({ ...s, [id]: !s[id] }));
  const isStatsExpanded = (id: string) => expandedStatsIds[id] ?? false;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Subtle indicator for long time-to-first-token
  const waitingForFirstToken = useMemo(() => {
    if (!isStreaming) return false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    const hasText = (last.content || '').length > 0 || (last.reasoning || '').length > 0;
    return !hasText;
  }, [isStreaming, messages]);
  const lastMessageId = useMemo(() => messages[messages.length - 1]?.id, [messages]);
  const saveEdit = (messageId: string) => {
    const text = draft.trim();
    if (!text) return;
    // Exit edit mode immediately for responsive UX
    const payload = draft;
    setEditingId(null);
    setDraft('');
    // Dispatch to appropriate editor depending on role
    const role = messages.find((mm) => mm.id === messageId)?.role;
    if (role === 'assistant') {
      editAssistantMessage(messageId, payload).catch(() => void 0);
    } else {
      // Fire-and-forget; store will kick off regeneration for user messages
      editUserMessage(messageId, payload, { rerun: true }).catch(() => void 0);
    }
  };

  const copyMessage = async (messageId: string) => {
    const msg = messages.find((x) => x.id === messageId);
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg.content || '');
      setCopiedId(messageId);
      setTimeout(() => setCopiedId((id) => (id === messageId ? null : id)), 1200);
    } catch {}
  };

  const startEditingMessage = (messageId: string) => {
    const msg = messages.find((x) => x.id === messageId);
    if (!msg) return;
    setEditingId(messageId);
    setDraft(msg.content || '');
  };

  const branchFromMessage = (messageId: string) => {
    if (isStreaming) return;
    branchFrom(messageId);
  };

  const regenerateMessage = (messageId: string) => {
    regenerate(messageId, {} as any);
  };

  const mobileActionMessage = useMemo(() => {
    if (!mobileSheet) return null;
    return messages.find((msg) => msg.id === mobileSheet.id) ?? null;
  }, [mobileSheet, messages]);

  const mobileActionPreview = useMemo(() => {
    if (!mobileActionMessage) return null;
    const text = (mobileActionMessage.content || '').trim();
    if (text) {
      const normalized = text.replace(/\s+/g, ' ');
      return normalized.length > 160 ? `${normalized.slice(0, 160)}…` : normalized;
    }
    if (
      Array.isArray(mobileActionMessage.attachments) &&
      mobileActionMessage.attachments.length > 0
    ) {
      const first = mobileActionMessage.attachments[0];
      return first?.name || first?.kind || 'Attachment';
    }
    return null;
  }, [mobileActionMessage]);

  const closeMobileSheet = useCallback(() => {
    setMobileSheet(null);
    setActiveMessageId(null);
  }, [setMobileSheet, setActiveMessageId]);

  useEffect(() => {
    if (!isMobile || !mobileSheet) return;
    if (typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMobileSheet();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobile, mobileSheet, closeMobileSheet]);

  useEffect(() => {
    if (!mobileSheet) return;
    const exists = messages.some((msg) => msg.id === mobileSheet.id);
    if (!exists) closeMobileSheet();
  }, [mobileSheet, messages, closeMobileSheet]);

  useEffect(() => {
    setVisibleCount(WINDOW_INCREMENT);
  }, [chatId]);

  useEffect(() => {
    setVisibleCount((count) => {
      if (messages.length === 0) return WINDOW_INCREMENT;
      return Math.min(Math.max(count, WINDOW_INCREMENT), messages.length);
    });
  }, [messages.length]);

  const startIndex = Math.max(0, messages.length - visibleCount);
  const visibleMessages = messages.slice(startIndex);
  const hiddenCount = startIndex;

  useEffect(() => {
    if (!isMobile || !mobileSheet) return;
    if (activeMessageId === mobileSheet.id) return;
    setActiveMessageId(mobileSheet.id);
  }, [isMobile, mobileSheet, activeMessageId, setActiveMessageId]);
  // Clear active highlight when tapping outside the active message on mobile
  useEffect(() => {
    if (!isMobile) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!activeMessageId) return;
      const target = e.target as Element | null;
      if (!target) return;
      const withinActive = target.closest(`[data-mid="${activeMessageId}"]`);
      if (withinActive) return;
      setActiveMessageId(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isMobile, activeMessageId]);
  return (
    <div
      ref={containerRef}
      className="scroll-area message-list space-y-2 h-full"
      style={{ background: 'var(--color-canvas)' }}
    >
      {hiddenCount > 0 && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setVisibleCount((count) => Math.min(messages.length, count + WINDOW_INCREMENT))
            }
          >
            Show earlier messages ({hiddenCount})
          </button>
        </div>
      )}

      {visibleMessages.map((message) => {
        const isEditingThisMessage = editingId === message.id;
        const showInlineActions = !isMobile || isEditingThisMessage;
        const messagePanels = {
          models,
          braveGloballyEnabled,
          braveEntry: braveByMessageId[message.id],
          isSourcesExpanded: isSourcesExpanded(message.id),
          onToggleSources: () => toggleSources(message.id),
          debugMode,
          debugEntry: debugByMessageId[message.id],
          isDebugExpanded: isDebugExpanded(message.id),
          onToggleDebug: () => toggleDebug(message.id),
          tutorGloballyEnabled,
          tutorEnabled,
          tutorEntry: tutorByMessageId[message.id] || (message as any)?.tutor,
          tutorMemoryDebug: tutorMemoryDebugByMessageId[message.id],
          tutorMemoryAutoUpdateDefault,
          updateChatSettings,
          autoReasoningModelIds,
          isStreaming,
          lastMessageId,
          reasoningExpanded: isExpanded(message.id),
          onToggleReasoning: () => toggle(message.id),
        } satisfies Omit<MessagePanelsProps, 'message'>;

        return (
          <MessageCard
            key={message.id}
            message={message}
            chat={chat}
            models={models}
            isMobile={isMobile}
            isActive={isMobile && activeMessageId === message.id}
            showInlineActions={showInlineActions}
            isStreaming={isStreaming}
            isEditing={isEditingThisMessage}
            editingId={editingId}
            draft={draft}
            setDraft={setDraft}
            setEditingId={setEditingId}
            saveEdit={saveEdit}
            startEditingMessage={startEditingMessage}
            copyMessage={copyMessage}
            copiedId={copiedId}
            branchFromMessage={branchFromMessage}
            regenerateMessage={regenerateMessage}
            onChooseRegenerateModel={(modelId) => {
              if (!modelId) return;
              regenerate(message.id, { modelId });
            }}
            setLightbox={setLightbox}
            waitingForFirstToken={waitingForFirstToken && message.id === lastMessageId}
            lastMessageId={lastMessageId}
            showStats={showStats}
            isStatsExpanded={isStatsExpanded}
            toggleStats={toggleStats}
            messagePanels={messagePanels}
            activeMessageId={activeMessageId}
            setActiveMessageId={setActiveMessageId}
            setMobileSheet={setMobileSheet}
            mobileSheet={mobileSheet}
            closeMobileSheet={closeMobileSheet}
            tutorEnabled={tutorEnabled}
          />
        );
      })}
      {showJump && (
        <div className="jump-to-latest">
          <button
            className="icon-button glass jump-to-latest__button"
            aria-label="Jump to latest"
            title="Jump to latest"
            onClick={() => {
              scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
              setShowJump(false);
              setAtBottom(true);
            }}
          >
            <ChevronDownIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Typing indicator is now rendered inline within the latest assistant message */}
      <div ref={endRef} />
      {/* Mobile action sheet */}
      {isMobile &&
        mobileSheet &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="mobile-sheet-overlay mobile-message-sheet-overlay"
            role="dialog"
            aria-modal="true"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeMobileSheet();
            }}
          >
            <div
              className="mobile-sheet card mobile-message-sheet"
              role="menu"
              aria-label="Message actions"
            >
              <div className="mobile-sheet-handle" aria-hidden="true" />
              <div className="mobile-message-sheet__header">
                <div className="mobile-message-sheet__title">
                  <span className="mobile-message-sheet__heading">Message actions</span>
                  {mobileActionPreview && (
                    <p className="mobile-message-sheet__preview">{mobileActionPreview}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close actions"
                  onClick={closeMobileSheet}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="mobile-message-sheet__actions">
                <button
                  type="button"
                  className="mobile-message-action"
                  onClick={async () => {
                    await copyMessage(mobileSheet.id);
                    closeMobileSheet();
                  }}
                >
                  <span className="mobile-message-action__icon">
                    <ClipboardIcon className="h-5 w-5" />
                  </span>
                  <span className="mobile-message-action__meta">
                    <span className="mobile-message-action__label">Copy</span>
                    <span className="mobile-message-action__hint">Copy message text</span>
                  </span>
                </button>
                {mobileActionMessage && (
                  <button
                    type="button"
                    className="mobile-message-action"
                    disabled={editingId === mobileActionMessage.id}
                    onClick={() => {
                      if (editingId === mobileActionMessage.id) return;
                      startEditingMessage(mobileActionMessage.id);
                      closeMobileSheet();
                    }}
                  >
                    <span className="mobile-message-action__icon">
                      <PencilSquareIcon className="h-5 w-5" />
                    </span>
                    <span className="mobile-message-action__meta">
                      <span className="mobile-message-action__label">
                        {editingId === mobileActionMessage.id ? 'Editing...' : 'Edit'}
                      </span>
                      <span className="mobile-message-action__hint">Modify this message</span>
                    </span>
                  </button>
                )}
                {mobileSheet.role === 'assistant' && (
                  <>
                    <button
                      type="button"
                      className="mobile-message-action"
                      disabled={isStreaming}
                      onClick={() => {
                        if (isStreaming) return;
                        branchFromMessage(mobileSheet.id);
                        closeMobileSheet();
                      }}
                    >
                      <span className="mobile-message-action__icon">
                        <ArrowUturnRightIcon className="h-5 w-5" />
                      </span>
                      <span className="mobile-message-action__meta">
                        <span className="mobile-message-action__label">Branch</span>
                        <span className="mobile-message-action__hint">
                          Start a new chat from here
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="mobile-message-action"
                      onClick={() => {
                        regenerateMessage(mobileSheet.id);
                        closeMobileSheet();
                      }}
                    >
                      <span className="mobile-message-action__icon">
                        <ArrowPathIcon className="h-5 w-5" />
                      </span>
                      <span className="mobile-message-action__meta">
                        <span className="mobile-message-action__label">Regenerate</span>
                        <span className="mobile-message-action__hint">Ask the assistant again</span>
                      </span>
                    </button>
                  </>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost w-full h-11"
                onClick={closeMobileSheet}
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
