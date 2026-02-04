'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { ChevronDownIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { Message } from '@/lib/types';
import { ImageLightbox } from '@/components/ImageLightbox';
import { MessageActionSheet } from '@/components/message/MessageActionSheet';
import { MessageCard } from '@/components/message/MessageCard';
import { useMessageListWindow } from '@/components/message/hooks/useMessageListWindow';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { useMessageListController } from '@/components/message/useMessageListController';
import { selectIsStreamingForChat, selectMessagesForChat } from '@/lib/store/selectors';

const EMPTY_MESSAGES: Message[] = [];
export function MessageList({ chatId, modelFilter }: { chatId: string; modelFilter?: string }) {
  const { allMessages, chat, isStreaming, planGeneration, composerFocused } = useChatStore(
    (state) => ({
      allMessages: selectMessagesForChat(chatId)(state) ?? EMPTY_MESSAGES,
      chat: state.chats.find((c) => c.id === chatId),
      isStreaming: selectIsStreamingForChat(chatId)(state),
      planGeneration: state.ui.plan.generationByChatId?.[chatId],
      composerFocused: state.ui.mobile.composerFocused,
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
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
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

  const {
    containerRef,
    contentRef,
    endRef,
    showJump,
    jumpToLatest,
    visibleMessages,
    hiddenCount,
    showMore,
  } = useMessageListWindow({
    messages,
    chatId,
    isStreaming,
    isMobile,
    prefersReducedMotion,
    isAssistantPlaceholder,
    onScrollAway: () => setActiveMessageId(null),
  });

  // Track previous composerFocused state to detect when keyboard opens
  const prevComposerFocusedRef = useRef(composerFocused);

  // When keyboard opens on mobile, scroll to show the last message
  useEffect(() => {
    const wasNotFocused = !prevComposerFocusedRef.current;
    const isNowFocused = composerFocused;
    prevComposerFocusedRef.current = composerFocused;

    if (!isMobile || !wasNotFocused || !isNowFocused) return;

    // Keyboard just opened - scroll to show last message
    const container = containerRef.current;
    if (!container) return;

    // Small delay to let the keyboard animation settle
    setTimeout(() => {
      // Find the last message element
      const messageElements = container.querySelectorAll('[data-mid]');
      const lastMessage = messageElements[messageElements.length - 1];

      if (lastMessage) {
        // Scroll minimally - just ensure the last message is visible without over-scrolling
        lastMessage.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }, 100);
  }, [composerFocused, isMobile, containerRef]);

  const [lightbox, setLightbox] = useState<{
    images: { src: string; name?: string }[];
    index: number;
  } | null>(null);

  // Composer is now rendered outside this scroll container in ChatPane.

  const showByDefault = chat?.settings.ui.showThinkingByDefault ?? false;
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
          const scopedCopiedId = copiedId === message.id ? copiedId : null;

          return (
            <MessageCard
              key={message.id}
              chatId={chatId}
              messageId={message.id}
              isMobile={isMobile}
              isActive={isMobile && activeMessageId === message.id}
              showInlineActions={showInlineActions}
              isEditing={isEditingThisMessage}
              setEditingId={setEditingId}
              saveEdit={saveEdit}
              startEditingMessage={startEditingMessage}
              copyMessage={copyMessage}
              copiedId={scopedCopiedId}
              setLightbox={setLightbox}
              waitingForFirstToken={waitingForFirstToken && message.id === lastMessageId}
              lastMessageId={lastMessageId}
              showReasoningByDefault={showByDefault}
              isStreaming={isStreaming && message.id === lastMessageId}
              isChatStreaming={isStreaming}
              onOpenMobileSheet={openMobileSheet}
              onBranch={branchFromMessage}
              onRegenerate={regenerateMessage}
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

      <MessageActionSheet
        isMobile={isMobile}
        mobileSheet={mobileSheet}
        mobileActionMessage={mobileActionMessage}
        mobileActionPreview={mobileActionPreview}
        editingId={editingId}
        isStreaming={isStreaming}
        onClose={closeMobileSheet}
        onCopy={copyMessage}
        onStartEditing={startEditingMessage}
        onBranch={branchFromMessage}
        onRegenerate={regenerateMessage}
      />
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
