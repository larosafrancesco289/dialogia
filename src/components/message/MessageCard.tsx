'use client';
import { useMemo } from 'react';
import {
  PencilSquareIcon,
  CheckIcon,
  ClipboardIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import { Markdown } from '@/lib/markdown';
import { RegenerateMenu } from '@/components/RegenerateMenu';
import { MessagePanels, type MessagePanelsProps } from '@/components/message/MessagePanels';
import { MessageAttachments } from '@/components/message/MessageAttachments';
import { LearnerModelUpdates } from '@/components/message/LearnerModelUpdates';
import styles from './MessageCard.module.css';
import type { Attachment, Chat, Message, ORModel } from '@/lib/types';
import { MessageActions, ActionButton } from '@/components/message/MessageActions';
import { StatsToggle } from '@/components/message/StatsToggle';

export type MessageCardProps = {
  message: Message;
  chat?: Chat | null;
  models: ORModel[];
  isMobile: boolean;
  isActive: boolean;
  showInlineActions: boolean;
  isStreaming: boolean;
  isEditing: boolean;
  editingId: string | null;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (id: string | null) => void;
  saveEdit: (messageId: string) => void;
  startEditingMessage: (messageId: string) => void;
  copyMessage: (messageId: string) => Promise<void> | void;
  copiedId: string | null;
  branchFromMessage: (messageId: string) => void;
  regenerateMessage: (messageId: string) => void;
  onChooseRegenerateModel: (modelId?: string) => void;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  waitingForFirstToken: boolean;
  lastMessageId?: string;
  showStats: boolean;
  isStatsExpanded: (messageId: string) => boolean;
  toggleStats: (messageId: string) => void;
  messagePanels: Omit<MessagePanelsProps, 'message'>;
  activeMessageId: string | null;
  setActiveMessageId: (id: string | null) => void;
  setMobileSheet: (sheet: { id: string; role: 'assistant' | 'user' } | null) => void;
  mobileSheet: { id: string; role: 'assistant' | 'user' } | null;
  closeMobileSheet: () => void;
  tutorEnabled: boolean;
};

export function MessageCard({
  message,
  chat,
  models,
  isMobile,
  isActive,
  showInlineActions,
  isStreaming,
  isEditing,
  editingId,
  draft,
  setDraft,
  setEditingId,
  saveEdit,
  startEditingMessage,
  copyMessage,
  copiedId,
  branchFromMessage,
  regenerateMessage,
  onChooseRegenerateModel,
  setLightbox,
  waitingForFirstToken,
  lastMessageId,
  showStats,
  isStatsExpanded,
  toggleStats,
  messagePanels,
  activeMessageId,
  setActiveMessageId,
  setMobileSheet,
  mobileSheet,
  closeMobileSheet,
  tutorEnabled,
}: MessageCardProps) {
  const isAssistant = message.role === 'assistant';
  const isLatestAssistant = message.role === 'assistant' && message.id === lastMessageId;

  const messageClassName = [
    'card',
    'p-0',
    'group',
    styles.messageCard,
    isAssistant ? styles.assistant : styles.user,
    isMobile && isActive ? styles.active : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleCopy = () => copyMessage(message.id);
  const handleStartEdit = () => startEditingMessage(message.id);
  const handleSaveEdit = () => saveEdit(message.id);
  const handleBranch = () => branchFromMessage(message.id);
  const handleRegenerate = () => regenerateMessage(message.id);

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  const handleTouchStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    if ((event as any).pointerType === 'mouse') return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      target.closest('button, .icon-button, a, input, textarea, [role="button"], .badge')
    )
      return;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const slop = 12;
    let fired = false;
    const timer = window.setTimeout(() => {
      fired = true;
      setActiveMessageId(message.id);
      setMobileSheet({ id: message.id, role: message.role as 'assistant' | 'user' });
    }, 320);
    const onMove = (ev: PointerEvent) => {
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (dx > slop || dy > slop) {
        moved = true;
        window.clearTimeout(timer);
        cleanup();
      }
    };
    const onUp = () => {
      window.clearTimeout(timer);
      cleanup();
    };
    const onCancel = () => {
      window.clearTimeout(timer);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove as any);
      window.removeEventListener('pointerup', onUp as any);
      window.removeEventListener('pointercancel', onCancel as any);
    };
    window.addEventListener('pointermove', onMove as any, { passive: true } as any);
    window.addEventListener('pointerup', onUp as any);
    window.addEventListener('pointercancel', onCancel as any);
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    event.preventDefault();
    setActiveMessageId(message.id);
    setMobileSheet({ id: message.id, role: message.role as 'assistant' | 'user' });
  };

  const messagePanelsNode = useMemo(
    () => (
      <MessagePanels
        message={message}
        chat={chat ?? undefined}
        models={models}
        braveGloballyEnabled={messagePanels.braveGloballyEnabled}
        braveEntry={messagePanels.braveEntry}
        isSourcesExpanded={messagePanels.isSourcesExpanded}
        onToggleSources={messagePanels.onToggleSources}
        debugMode={messagePanels.debugMode}
        debugEntry={messagePanels.debugEntry}
        isDebugExpanded={messagePanels.isDebugExpanded}
        onToggleDebug={messagePanels.onToggleDebug}
        tutorGloballyEnabled={messagePanels.tutorGloballyEnabled}
        tutorEnabled={messagePanels.tutorEnabled}
        tutorEntry={messagePanels.tutorEntry}
        autoReasoningModelIds={messagePanels.autoReasoningModelIds}
        isStreaming={messagePanels.isStreaming}
        lastMessageId={messagePanels.lastMessageId}
        reasoningExpanded={messagePanels.reasoningExpanded}
        onToggleReasoning={messagePanels.onToggleReasoning}
        showToolCallLog={messagePanels.showToolCallLog}
        showDebugRawJson={messagePanels.showDebugRawJson}
        toolCalls={messagePanels.toolCalls}
        highlightToolCalls={messagePanels.highlightToolCalls}
      />
    ),
    [message, chat, models, messagePanels],
  );

  return (
    <div
      className={messageClassName}
      data-mid={message.id}
      aria-label={message.role === 'assistant' ? 'Assistant message' : 'Your message'}
      onPointerDown={handleTouchStart}
      onContextMenu={handleContextMenu}
    >
      {isAssistant ? (
        <AssistantMessageContent
          message={message}
          isMobile={isMobile}
          showInlineActions={showInlineActions}
          isStreaming={isStreaming}
          isEditing={isEditing}
          copyMessage={handleCopy}
          copiedId={copiedId}
          startEditingMessage={handleStartEdit}
          saveEdit={handleSaveEdit}
          setEditingId={setEditingId}
          setDraft={setDraft}
          draft={draft}
          waitingForFirstToken={waitingForFirstToken}
          isLatestAssistant={isLatestAssistant}
          lastMessageId={lastMessageId}
          models={models}
          chat={chat}
          showStats={showStats}
          isStatsExpanded={isStatsExpanded}
          toggleStats={toggleStats}
          branchFromMessage={handleBranch}
          regenerateMessage={handleRegenerate}
          onChooseRegenerateModel={onChooseRegenerateModel}
          setLightbox={setLightbox}
          attachments={attachments}
          tutorEnabled={tutorEnabled}
          messagePanelsNode={messagePanelsNode}
        />
      ) : (
        <UserMessageContent
          message={message}
          isMobile={isMobile}
          showInlineActions={showInlineActions}
          isEditing={isEditing}
          copyMessage={handleCopy}
          copiedId={copiedId}
          startEditingMessage={handleStartEdit}
          saveEdit={handleSaveEdit}
          setEditingId={setEditingId}
          setDraft={setDraft}
          draft={draft}
          setLightbox={setLightbox}
          attachments={attachments}
        />
      )}
    </div>
  );
}

function AssistantMessageContent({
  message,
  isMobile,
  showInlineActions,
  isStreaming,
  isEditing,
  copyMessage,
  copiedId,
  startEditingMessage,
  saveEdit,
  setEditingId,
  setDraft,
  draft,
  waitingForFirstToken,
  isLatestAssistant,
  lastMessageId,
  models,
  chat,
  showStats,
  isStatsExpanded,
  toggleStats,
  branchFromMessage,
  regenerateMessage,
  onChooseRegenerateModel,
  setLightbox,
  attachments,
  tutorEnabled,
  messagePanelsNode,
}: {
  message: Message;
  isMobile: boolean;
  showInlineActions: boolean;
  isStreaming: boolean;
  isEditing: boolean;
  copyMessage: () => void;
  copiedId: string | null;
  startEditingMessage: () => void;
  saveEdit: () => void;
  setEditingId: (id: string | null) => void;
  setDraft: (value: string) => void;
  draft: string;
  waitingForFirstToken: boolean;
  isLatestAssistant: boolean;
  lastMessageId?: string;
  models: ORModel[];
  chat?: Chat | null;
  showStats: boolean;
  isStatsExpanded: (id: string) => boolean;
  toggleStats: (id: string) => void;
  branchFromMessage: () => void;
  regenerateMessage: () => void;
  onChooseRegenerateModel: (modelId?: string) => void;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  attachments: Attachment[];
  tutorEnabled: boolean;
  messagePanelsNode: React.ReactNode;
}) {
  return (
    <div className="relative">
      {showInlineActions && (
        <MessageActions
          isEditing={isEditing}
          isMobile={isMobile}
          onSave={saveEdit}
          onCancel={() => {
            setEditingId(null);
            setDraft('');
          }}
        >
          <ActionButton
            icon={
              copiedId === message.id ? (
                <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 transition-all">
                  <CheckIcon className="h-4 w-4" />
                  <span className="text-xs font-medium">Copied</span>
                </div>
              ) : (
                <ClipboardIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              )
            }
            title={copiedId === message.id ? 'Copied' : 'Copy message'}
            ariaLabel="Copy message"
            onClick={copyMessage}
            className={copiedId === message.id ? 'bg-green-500/10 border-green-500/20' : ''}
          />
          {!isStreaming && (
            <ActionButton
              icon={<PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />}
              title="Edit message"
              ariaLabel="Edit message"
              onClick={startEditingMessage}
            />
          )}
          <ActionButton
            icon={<ArrowUturnRightIcon className="h-5 w-5 sm:h-4 sm:w-4" />}
            title="Create a new chat starting from this reply"
            ariaLabel="Branch chat from here"
            onClick={branchFromMessage}
            disabled={isStreaming}
          />
          {!tutorEnabled && <RegenerateMenu onChoose={onChooseRegenerateModel} />}
        </MessageActions>
      )}

      {messagePanelsNode}

      <MessageAttachments attachments={attachments} onOpenLightbox={setLightbox} />

      <div className="px-4 py-3">
        {isEditing ? (
          <textarea
            className="textarea w-full text-sm"
            rows={Math.min(8, Math.max(3, Math.ceil((draft.length || 1) / 60)))}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                saveEdit();
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                saveEdit();
              }
            }}
            placeholder="Edit assistant message..."
          />
        ) : waitingForFirstToken && message.id === lastMessageId ? (
          <div className={styles.typingIndicator} aria-live="polite" aria-label="Generating">
            <span className={styles.typingBar} />
            <span className={styles.typingBar} />
            <span className={styles.typingBar} />
          </div>
        ) : (
          <Markdown content={message.content} />
        )}
      </div>

      {/* Learner Model Updates */}
      {!isEditing && <LearnerModelUpdates message={message} />}

      <StatsToggle
        showStats={showStats}
        waitingForFirstToken={waitingForFirstToken}
        isLatestAssistant={isLatestAssistant}
        isExpanded={isStatsExpanded(message.id)}
        onToggle={() => toggleStats(message.id)}
        message={message}
        chat={chat}
        models={models}
      />
    </div>
  );
}

function UserMessageContent({
  message,
  isMobile,
  showInlineActions,
  isEditing,
  copyMessage,
  copiedId,
  startEditingMessage,
  saveEdit,
  setEditingId,
  setDraft,
  draft,
  setLightbox,
  attachments,
}: {
  message: Message;
  isMobile: boolean;
  showInlineActions: boolean;
  isEditing: boolean;
  copyMessage: () => void;
  copiedId: string | null;
  startEditingMessage: () => void;
  saveEdit: () => void;
  setEditingId: (id: string | null) => void;
  setDraft: (value: string) => void;
  draft: string;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  attachments: Attachment[];
}) {
  return (
    <div className="relative">
      {showInlineActions && (
        <MessageActions
          isEditing={isEditing}
          isMobile={isMobile}
          onSave={saveEdit}
          onCancel={() => {
            setEditingId(null);
            setDraft('');
          }}
        >
          <ActionButton
            icon={<PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />}
            title="Edit message"
            ariaLabel="Edit message"
            onClick={startEditingMessage}
          />
          <ActionButton
            className="ml-1"
            icon={
              copiedId === message.id ? (
                <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 transition-all">
                  <CheckIcon className="h-4 w-4" />
                  <span className="text-xs font-medium">Copied</span>
                </div>
              ) : (
                <ClipboardIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              )
            }
            title={copiedId === message.id ? 'Copied' : 'Copy message'}
            ariaLabel="Copy message"
            onClick={copyMessage}
          />
        </MessageActions>
      )}

      <MessageAttachments attachments={attachments} onOpenLightbox={setLightbox} />

      <div className="px-4 py-3">
        {isEditing ? (
          <textarea
            className="textarea w-full text-sm"
            rows={Math.min(8, Math.max(3, Math.ceil((draft.length || 1) / 60)))}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                saveEdit();
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                saveEdit();
              }
            }}
            placeholder="Edit your message..."
          />
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
    </div>
  );
}
