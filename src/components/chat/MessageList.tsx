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
import { resolveDisplayPreferences } from '@/lib/settings/chatDefaults';
import { useMessageListController } from '@/components/message/useMessageListController';
import { latestExchangeOnly, messageHasModuleContent } from '@/lib/modules';
import {
  selectChatMessagesLoaded,
  selectIsStreamingForChat,
  selectIsTutorEnabledForChat,
  selectMessagesForChat,
  selectRepliesInOtherTab,
} from '@/lib/store/selectors';
import { replyInProgress } from '@/lib/ui/streaming';

const EMPTY_MESSAGES: Message[] = [];
const JUST_WRITTEN_MS = 1500;
export function MessageList({ chatId, modelFilter }: { chatId: string; modelFilter?: string }) {
  const {
    allMessages,
    isStreamingHere,
    repliesInOtherTab,
    composerFocused,
    autoScrollPref,
    messagesLoaded,
    showByDefault,
  } = useChatStore(
    (state) => ({
      allMessages: selectMessagesForChat(chatId)(state) ?? EMPTY_MESSAGES,
      isStreamingHere: selectIsStreamingForChat(chatId)(state),
      repliesInOtherTab: selectRepliesInOtherTab(chatId)(state),
      composerFocused: state.ui.mobile.composerFocused,
      autoScrollPref: selectIsTutorEnabledForChat(chatId)(state)
        ? (state.ui.tutor?.autoScroll ?? false)
        : true,
      messagesLoaded: selectChatMessagesLoaded(chatId)(state),
      showByDefault: resolveDisplayPreferences(state.ui.chatDefaults).showThinkingByDefault,
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
  const lastMessageId = useMemo(() => messages[messages.length - 1]?.id, [messages]);
  // A reply another tab is writing reads as in progress here too: its
  // checkpoints on disk would otherwise show it as cut off.
  const progress = useMemo(
    () => replyInProgress(isStreamingHere, lastMessageId, repliesInOtherTab),
    [isStreamingHere, lastMessageId, repliesInOtherTab],
  );
  const isStreaming = progress.busy;

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

  // What was already here when the chat opened (or finished loading) is
  // history and appears without motion; only messages added while it is
  // open move into place. Keyed by chat and load state, so a lazily
  // hydrated chat counts its loaded messages as history too. A message
  // written a moment ago is never history: the first one of a new chat
  // mounts with its list, coming over from the welcome page.
  const historyRef = useRef<{ key: string; ids: Set<string> } | null>(null);
  const historyKey = `${chatId}:${messagesLoaded}`;
  if (historyRef.current?.key !== historyKey) {
    const openedAt = Date.now();
    historyRef.current = {
      key: historyKey,
      ids: new Set(
        messages.filter((m) => openedAt - m.createdAt > JUST_WRITTEN_MS).map((m) => m.id),
      ),
    };
  }
  const history = historyRef.current.ids;

  // Composer is now rendered outside this scroll container in ChatPane.

  // Subtle indicator for long time-to-first-token
  const waitingForFirstToken = useMemo(() => {
    if (!isStreaming) return false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    const hasText = (last.content || '').length > 0 || (last.reasoning || '').length > 0;
    return !hasText;
  }, [isStreaming, messages]);

  return (
    <div ref={containerRef} className="scroll-area message-list h-full">
      <div className="sr-only" role="status" aria-live="polite">
        {completionAnnouncement}
      </div>
      <div ref={contentRef} className="message-list__content space-y-2 pb-4">
        {!messagesLoaded && visibleMessages.length === 0 && (
          // Most chats arrive in a few milliseconds; the line only shows
          // itself (CSS delay) when a read is actually slow.
          <p className="message-list__loading" role="status">
            Opening the conversation…
          </p>
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
              arrives={!history.has(message.id)}
              showReasoningByDefault={showByDefault}
              isStreaming={progress.isWriting(message.id)}
              isChatStreaming={isStreaming}
              onOpenMobileSheet={openMobileSheet}
              onBranch={branchFromMessage}
              onRegenerate={regenerateMessage}
              canRedo={canRedo(message.id)}
            />
          );
        })}

        {/* Typing indicator is now rendered inline within the latest assistant message */}
        <div ref={endRef} className="message-list__bottom-sentinel" aria-hidden="true" />
      </div>

      {showJump && (
        <div className="jump-to-latest">
          <button
            className="btn-float motion-rise pointer-events-auto"
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
