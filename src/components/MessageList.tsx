'use client';
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import {
  ChevronDownIcon,
  PencilSquareIcon,
  XMarkIcon,
  ClipboardIcon,
  ArrowPathIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import type { Message } from '@/lib/types';
import { ImageLightbox } from '@/components/ImageLightbox';
import { MessageCard } from '@/components/message/MessageCard';
import { useMessageScrolling } from '@/components/message/useMessageScrolling';
import { useMessageWindow } from '@/components/message/hooks/useMessageWindow';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { useMessagePanelsToggles } from '@/components/message/hooks/useMessagePanelsToggles';
import { useMessageListController } from '@/components/message/useMessageListController';

const EMPTY_MESSAGES: Message[] = [];
export function MessageList({ chatId, modelFilter }: { chatId: string; modelFilter?: string }) {
  const { allMessages, chat, isStreaming, planGeneration } = useChatStore(
    (state) => ({
      allMessages: state.messages[chatId] ?? EMPTY_MESSAGES,
      chat: state.chats.find((c) => c.id === chatId),
      isStreaming: state.ui.isStreaming,
      planGeneration: state.ui.plan.generationByChatId?.[chatId],
    }),
    shallow,
  );
  const { regenerate, branchFrom } = useChatStore(
    (state) => ({
      regenerate: state.regenerateAssistantMessage,
      branchFrom: state.branchChatFromMessage,
    }),
    shallow,
  );
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, []);
  const isMobile = useIsMobile();
  const messages = useMemo(() => {
    const base = !modelFilter
      ? allMessages
      : allMessages.filter((message) => {
          if (message.role !== 'assistant') return true;
          const target = typeof message.model === 'string' ? message.model : undefined;
          return target === modelFilter;
        });
    return base.filter((message) => !(message.role === 'user' && message.metadata?.hiddenFromUser));
  }, [allMessages, modelFilter]);

  const { editUserMessage, editAssistantMessage } = useChatStore(
    (state) => ({
      editUserMessage: state.editUserMessage,
      editAssistantMessage: state.editAssistantMessage,
    }),
    shallow,
  );
  const {
    copiedId,
    editingId,
    draft,
    setDraft,
    setEditingId,
    saveEdit,
    startEditingMessage,
    copyMessage,
    branchFromMessage,
    regenerateMessage,
    mobileSheet,
    openMobileSheet,
    closeMobileSheet,
    mobileActionMessage,
    mobileActionPreview,
    activeMessageId,
    setActiveMessageId,
  } = useMessageListController({
    messages,
    isStreaming,
    isMobile,
    editUserMessage,
    editAssistantMessage,
    branchFrom,
    regenerate,
  });

  const isAssistantPlaceholder = useCallback((message?: Message, previous?: Message) => {
    if (!message || message.role !== 'assistant' || previous?.role !== 'user') return false;
    const hasContent = message.content.trim().length > 0;
    const hasReasoning = !!(message.reasoning && message.reasoning.trim().length > 0);
    const hasDeepResearch =
      !!(message.deepResearch?.trace && message.deepResearch.trace.length > 0) ||
      !!message.deepResearch?.answer;
    const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
    const hasTutorPayload = !!(message.tutor || message.tutorWelcome);
    return !hasContent && !hasReasoning && !hasDeepResearch && !hasAttachments && !hasTutorPayload;
  }, []);

  const { containerRef, contentRef, endRef, showJump, jumpToLatest } = useMessageScrolling({
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
  const WINDOW_PAGE_SIZE = 150;

  // Composer is now rendered outside this scroll container in ChatPane.

  const showByDefault = chat?.settings.show_thinking_by_default ?? false;
  const {
    isReasoningExpanded,
    toggleReasoning,
    isSourcesExpanded,
    toggleSources,
    isDebugExpanded,
    toggleDebug,
    isStatsExpanded,
    toggleStats,
  } = useMessagePanelsToggles({ showReasoningByDefault: showByDefault });
  const panelControls = useMemo(
    () => ({
      isReasoningExpanded,
      toggleReasoning,
      isSourcesExpanded,
      toggleSources,
      isDebugExpanded,
      toggleDebug,
      isStatsExpanded,
      toggleStats,
    }),
    [
      isReasoningExpanded,
      toggleReasoning,
      isSourcesExpanded,
      toggleSources,
      isDebugExpanded,
      toggleDebug,
      isStatsExpanded,
      toggleStats,
    ],
  );
  // Subtle indicator for long time-to-first-token
  const waitingForFirstToken = useMemo(() => {
    if (!isStreaming) return false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    const hasText =
      (last.content || '').length > 0 ||
      (last.reasoning || '').length > 0 ||
      !!last.deepResearch?.answer ||
      !!(last.deepResearch?.trace && last.deepResearch.trace.length > 0);
    return !hasText;
  }, [isStreaming, messages]);
  const lastMessageId = useMemo(() => messages[messages.length - 1]?.id, [messages]);

  const {
    visibleItems: visibleMessages,
    hiddenCount,
    showMore,
  } = useMessageWindow(messages, {
    pageSize: WINDOW_PAGE_SIZE,
    resetKey: chatId,
  });
  return (
    <div
      ref={containerRef}
      className="scroll-area message-list h-full"
      style={{ background: 'var(--color-canvas)' }}
    >
      <div ref={contentRef} className="space-y-2 pb-4">
        {hiddenCount > 0 && (
          <div className="flex justify-center py-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={showMore}>
              Show earlier messages ({hiddenCount})
            </button>
          </div>
        )}

        {visibleMessages.map((message) => {
          const isEditingThisMessage = editingId === message.id;
          const showInlineActions = !isMobile || isEditingThisMessage;

          return (
            <MessageCard
              key={message.id}
              chatId={chatId}
              messageId={message.id}
              isMobile={isMobile}
              isActive={isMobile && activeMessageId === message.id}
              showInlineActions={showInlineActions}
              isEditing={isEditingThisMessage}
              draft={draft}
              setDraft={setDraft}
              setEditingId={setEditingId}
              saveEdit={saveEdit}
              startEditingMessage={startEditingMessage}
              copyMessage={copyMessage}
              copiedId={copiedId}
              setLightbox={setLightbox}
              waitingForFirstToken={waitingForFirstToken && message.id === lastMessageId}
              lastMessageId={lastMessageId}
              panels={panelControls}
              onOpenMobileSheet={openMobileSheet}
            />
          );
        })}

        {planGeneration?.status === 'loading' && (
          <div className="mx-auto w-full max-w-2xl px-2">
            <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 px-5 py-4 shadow-[var(--shadow-card)]">
              <div
                className="pointer-events-none absolute inset-0 opacity-60 mix-blend-screen"
                aria-hidden="true"
              >
                <div className="absolute -top-24 -left-6 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute -bottom-16 right-0 h-52 w-52 rounded-full bg-primary/15 blur-[80px]" />
              </div>
              <div className="relative flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-primary/15 p-2">
                  <ArrowPathIcon className="h-5 w-5 text-primary animate-spin" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">
                    Designing your personalized learning plan…
                  </p>
                  <p className="mt-1 text-xs text-primary/80">
                    {planGeneration.goal
                      ? `Goal: ${planGeneration.goal}`
                      : 'Mapping out topics, objectives, and prerequisites for you.'}
                  </p>
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                    <div className="plan-loading-bar h-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Typing indicator is now rendered inline within the latest assistant message */}
        <div ref={endRef} />
      </div>

      {showJump && (
        <div className="jump-to-latest">
          <button
            className="btn-fab pointer-events-auto !w-12 !h-12 !p-0"
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
            onClick={() => {
              jumpToLatest();
              // Intentionally not setting setShowJump(false) here; let the scroll handler do it
            }}
          >
            <ChevronDownIcon className="h-6 w-6" />
          </button>
        </div>
      )}

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
