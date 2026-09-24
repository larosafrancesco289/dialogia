import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import type { Message } from '@/lib/types';
import { ImageLightbox } from '@/components/ImageLightbox';
import { MessageActionSheet } from '@/components/message/MessageActionSheet';
import { MessageCard } from '@/components/message/MessageCard';
import { useMessageListWindow } from '@/components/message/hooks/useMessageListWindow';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { useMessageListController } from '@/components/message/useMessageListController';
import { latestExchangeOnly, messageHasModuleContent } from '@/lib/modules';
import {
  selectChatMessagesLoaded,
  selectIsStreamingForChat,
  selectIsTutorEnabledForChat,
  selectMessagesForChat,
} from '@/lib/store/selectors';

const EMPTY_MESSAGES: Message[] = [];
export function MessageList({ chatId, modelFilter }: { chatId: string; modelFilter?: string }) {
  const {
    allMessages,
    chat,
    isStreaming,
    planGeneration,
    composerFocused,
    autoScrollPref,
    messagesLoaded,
  } = useChatStore(
    (state) => ({
      allMessages: selectMessagesForChat(chatId)(state) ?? EMPTY_MESSAGES,
      chat: state.chats.find((c) => c.id === chatId),
      isStreaming: selectIsStreamingForChat(chatId)(state),
      planGeneration: state.ui.plan?.generationByChatId?.[chatId],
      composerFocused: state.ui.mobile.composerFocused,
      autoScrollPref: selectIsTutorEnabledForChat(chatId)(state)
        ? (state.ui.tutor?.autoScroll ?? false)
        : true,
      messagesLoaded: selectChatMessagesLoaded(chatId)(state),
    }),
    shallow,
  );
  const { regenerate, branchFrom, latestOnly } = useChatStore(
    (state) => ({
      regenerate: state.regenerateAssistantMessage,
      branchFrom: state.branchChatFromMessage,
      latestOnly: latestExchangeOnly(state, chatId),
    }),
    shallow,
  );
  // Where a module's record follows the transcript, only the latest exchange
  // (the last user message and its replies) can be regenerated or rerun.
  const redoable = useMemo(() => {
    if (!latestOnly) return undefined;
    let lastUser = -1;
    allMessages.forEach((message, index) => {
      if (message.role === 'user') lastUser = index;
    });
    return new Set(allMessages.slice(Math.max(0, lastUser)).map((message) => message.id));
  }, [latestOnly, allMessages]);
  const canRedo = useCallback((id: string) => !redoable || redoable.has(id), [redoable]);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
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
    editPreviousUserMessage,
    copyMessage,
    branchFromMessage,
    regenerateMessage,
    mobileSheet,
    openMobileSheet,
    closeMobileSheet,
    mobileActionMessage,
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
    const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
    const hasTutorPayload = !!(message.tutor || message.tutorWelcome);
    return (
      !hasContent &&
      !hasReasoning &&
      !hasAttachments &&
      !hasTutorPayload &&
      !messageHasModuleContent(useChatStore.getState(), message)
    );
  }, []);

  const {
    containerRef,
    contentRef,
    endRef,
    atBottom,
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
    autoScrollPreference: autoScrollPref,
  });

  const latestAssistantId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      if (visibleMessages[i].role === 'assistant') return visibleMessages[i].id;
    }
    return undefined;
  }, [visibleMessages]);

  // Track previous composerFocused state to detect when keyboard opens
  const prevComposerFocusedRef = useRef(composerFocused);

  // When keyboard opens on mobile, scroll to show the last message
  useEffect(() => {
    const wasNotFocused = !prevComposerFocusedRef.current;
    const isNowFocused = composerFocused;
    prevComposerFocusedRef.current = composerFocused;

    if (!isMobile || !wasNotFocused || !isNowFocused || !atBottom) return;

    // Keyboard just opened - scroll to show last message
    const container = containerRef.current;
    if (!container) return;

    // Small delay to let the keyboard animation settle
    const timeoutId = setTimeout(() => {
      // Find the last message element
      const messageElements = container.querySelectorAll('[data-mid]');
      const lastMessage = messageElements[messageElements.length - 1];

      if (lastMessage) {
        // Scroll minimally - just ensure the last message is visible without over-scrolling
        lastMessage.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [atBottom, composerFocused, isMobile, containerRef]);

  const [lightbox, setLightbox] = useState<{
    images: { src: string; name?: string }[];
    index: number;
  } | null>(null);

  // Announce stream completion to screen readers; the typing indicator covers
  // the start, but nothing else signals that the response has finished.
  const [completionAnnouncement, setCompletionAnnouncement] = useState('');
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;
    if (!wasStreaming || isStreaming) return;
    setCompletionAnnouncement('Response complete');
    const tid = setTimeout(() => setCompletionAnnouncement(''), 2000);
    return () => clearTimeout(tid);
  }, [isStreaming]);

  // Composer is now rendered outside this scroll container in ChatPane.

  const showByDefault = chat?.settings.ui.showThinkingByDefault ?? false;
  // Subtle indicator for long time-to-first-token
  const waitingForFirstToken = useMemo(() => {
    if (!isStreaming) return false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    const hasText = (last.content || '').length > 0 || (last.reasoning || '').length > 0;
    return !hasText;
  }, [isStreaming, messages]);
  const lastMessageId = useMemo(() => messages[messages.length - 1]?.id, [messages]);

  return (
    <div ref={containerRef} className="scroll-area message-list h-full">
      <div className="sr-only" role="status" aria-live="polite">
        {completionAnnouncement}
      </div>
      <div ref={contentRef} className="message-list__content space-y-2 pb-4">
        {!messagesLoaded && visibleMessages.length === 0 && (
          <div
            className="flex justify-center py-8 text-sm text-[var(--color-fg-muted)]"
            role="status"
          >
            Loading conversation…
          </div>
        )}
        {hiddenCount > 0 && (
          <div className="flex justify-center py-2">
            <button type="button" className="btn-ghost btn-sm" onClick={showMore}>
              Show earlier messages ({hiddenCount})
            </button>
          </div>
        )}

        {visibleMessages.map((message) => {
          const isEditingThisMessage = editingId === message.id;
          // A phone has no hover: the latest reply keeps its actions in view,
          // as phone chat apps do, and older ones answer a long press.
          const showInlineActions =
            !isMobile || isEditingThisMessage || message.id === latestAssistantId;
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
              onEditPreviousUserMessage={editPreviousUserMessage}
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
              canRedo={canRedo(message.id)}
            />
          );
        })}

        {planGeneration?.status === 'loading' && (
          // Set like a chapter break: the plan is the book's first contents.
          <div className="plan-drafting" role="status">
            <p className="plan-drafting__kicker">Drafting your plan</p>
            <p className="plan-drafting__line">
              {planGeneration.goal
                ? planGeneration.goal
                : 'Mapping out topics, objectives and prerequisites.'}
            </p>
            <div className="plan-drafting__track">
              <div className="plan-loading-bar h-full" />
            </div>
          </div>
        )}

        {/* Typing indicator is now rendered inline within the latest assistant message */}
        <div ref={endRef} className="message-list__bottom-sentinel" aria-hidden="true" />
      </div>

      {showJump && (
        <div className="jump-to-latest">
          <button
            className="btn-fab pointer-events-auto !w-9 !h-9 !p-0"
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
            onClick={() => {
              jumpToLatest();
              // Intentionally not setting setShowJump(false) here; let the scroll handler do it
            }}
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <MessageActionSheet
        isMobile={isMobile}
        mobileSheet={mobileSheet}
        mobileActionMessage={mobileActionMessage}
        editingId={editingId}
        isStreaming={isStreaming}
        onClose={closeMobileSheet}
        onCopy={copyMessage}
        onStartEditing={startEditingMessage}
        onBranch={branchFromMessage}
        onRegenerate={regenerateMessage}
        canRedo={mobileSheet ? canRedo(mobileSheet.id) : true}
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
