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
import type { Attachment, Message } from '@/lib/types';
import ImageLightbox from '@/components/ImageLightbox';
import MessagePanels, { type MessagePanelsProps } from '@/components/message/MessagePanels';
import MessageCard from '@/components/message/MessageCard';
import { useMessageScrolling } from '@/components/message/useMessageScrolling';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
export function MessageList({ chatId }: { chatId: string }) {
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, []);
  const isMobile = useIsMobile();

  const isAssistantPlaceholder = useCallback((message?: Message, previous?: Message) => {
    if (!message || message.role !== 'assistant' || previous?.role !== 'user') return false;
    const hasContent = message.content.trim().length > 0;
    const hasReasoning = !!(message.reasoning && message.reasoning.trim().length > 0);
    const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
    const hasTutorPayload = !!(message.tutor || message.tutorWelcome);
    return !hasContent && !hasReasoning && !hasAttachments && !hasTutorPayload;
  }, []);

  // Tap-to-highlight state for mobile actions
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  const {
    containerRef,
    endRef,
    atBottom,
    showJump,
    setShowJump,
    jumpToLatest,
  } = useMessageScrolling({
    messages,
    isStreaming,
    isMobile,
    prefersReducedMotion,
    isAssistantPlaceholder,
    onScrollAway: () => setActiveMessageId(null),
  });

  const [lightbox, setLightbox] = useState<{
    images: { src: string; name?: string }[];
    index: number;
  } | null>(null);
  const WINDOW_INCREMENT = 150;
  const [visibleCount, setVisibleCount] = useState(WINDOW_INCREMENT);
  // Mobile contextual action sheet (bottom)
  const [mobileSheet, setMobileSheet] = useState<{ id: string; role: 'assistant' | 'user' } | null>(
    null,
  );

  // Composer is now rendered outside this scroll container in ChatPane.

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
              jumpToLatest();
              setShowJump(false);
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
